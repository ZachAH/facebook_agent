import cron from 'node-cron';
import { query } from '../db/client.js';
import { generatePost, pickRotationTopic } from '../agents/contentAgent.js';
import { generateImage } from '../services/imageService.js';
import { getTokenStatus } from '../services/facebookService.js';
import { sendDraftSMS } from '../services/twilioService.js';
import {
  sendDraftNotification,
  sendPushToAll,
} from '../services/notificationService.js';

const TIMEZONE = 'America/Chicago'; // Central Time

// Warn the owner this many days before the Facebook page token expires.
const TOKEN_WARN_DAYS = 7;

// Drafts are generated a couple hours before the configured post time so the
// owner has a window to approve via SMS.
const JOBS = [
  { expr: '0 7 * * 2', postType: 'tech_tip_tuesday', timeKey: 'post_time_tuesday' },
  { expr: '0 7 * * 3', postType: 'wait_what_wednesday', timeKey: 'post_time_wednesday' },
  { expr: '0 8 * * 5', postType: 'friday_weekend', timeKey: 'post_time_friday' },
];

/** True if a post of this type already exists for the current (CT) week. */
async function alreadyGeneratedThisWeek(postType) {
  const { rows } = await query(
    `SELECT 1 FROM posts
      WHERE post_type = $1
        AND created_at >= date_trunc('week', NOW())
      LIMIT 1`,
    [postType]
  );
  return rows.length > 0;
}

/**
 * Fetch and advance the rotation index for a post type's topic pool. Stored
 * in `settings` under `topic_index_<postType>` so it persists across restarts
 * and deploys — each call returns the topic to use *now* and bumps the
 * counter for next time.
 */
async function nextRotationTopic(postType) {
  const settingKey = `topic_index_${postType}`;
  const { rows } = await query('SELECT value FROM settings WHERE key = $1', [settingKey]);
  const index = rows[0] ? parseInt(rows[0].value, 10) || 0 : 0;

  const topic = pickRotationTopic(postType, index);
  if (topic === undefined) return undefined; // no rotation pool for this post type

  await query(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [settingKey, String(index + 1)]
  );
  return topic;
}

/** Recent post bodies of this type, most recent first — passed to the content
 * agent as a repetition safety net independent of topic rotation. */
async function recentPostBodies(postType, limit = 4) {
  const { rows } = await query(
    `SELECT content FROM posts
      WHERE post_type = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [postType, limit]
  );
  return rows.map((r) => r.content);
}

/** Compute a scheduled_for timestamp from a "HH:MM" setting for today. */
function scheduledForFromSetting(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

async function runJob(postType, timeKey) {
  try {
    if (await alreadyGeneratedThisWeek(postType)) {
      console.log(`[cron] ${postType} already generated this week — skipping`);
      return;
    }

    console.log(`[cron] generating ${postType} draft`);
    const topic = await nextRotationTopic(postType);
    const recentPosts = await recentPostBodies(postType);
    const content = await generatePost(postType, topic, recentPosts);
    const imageUrl = await generateImage(postType, content);

    const { rows: settings } = await query('SELECT value FROM settings WHERE key = $1', [
      timeKey,
    ]);
    const scheduledFor = scheduledForFromSetting(settings[0]?.value);

    const { rows } = await query(
      `INSERT INTO posts (content, image_url, post_type, status, scheduled_for)
       VALUES ($1, $2, $3, 'pending', $4)
       RETURNING *`,
      [content, imageUrl, postType, scheduledFor]
    );
    const post = rows[0];

    // Only text the owner if SMS approvals are switched on.
    const { rows: smsRows } = await query(
      "SELECT value FROM settings WHERE key = 'sms_active'"
    );
    if (smsRows[0]?.value === 'true') {
      try {
        await sendDraftSMS(post);
      } catch (smsErr) {
        console.warn('[cron] SMS send failed (post still saved):', smsErr.message);
      }
    }

    sendDraftNotification(post).catch((err) =>
      console.warn('[cron] push notification failed:', err.message)
    );
    console.log(`[cron] ${postType} draft saved (post ${post.id})`);
  } catch (err) {
    console.error(`[cron] ${postType} job failed:`, err.message || err);
  }
}

/**
 * Daily check that pushes a warning when the Facebook page token is invalid or
 * within TOKEN_WARN_DAYS of expiring. Throttled via the `settings` table so the
 * owner is notified once per distinct expiry (or once for an invalid token),
 * not every single day.
 */
async function runTokenCheck() {
  try {
    const status = await getTokenStatus();

    // Couldn't determine status (e.g. transient Graph error) — don't notify.
    if (!status.ok) {
      console.warn('[cron] token check could not read status:', status.error);
      return;
    }
    // Healthy and either never-expires or comfortably far out — nothing to do.
    if (status.isValid && (status.neverExpires || status.daysRemaining > TOKEN_WARN_DAYS)) {
      return;
    }

    // Throttle key: the expiry we're warning about (or 'invalid'). We only
    // notify when this differs from the last value we warned for.
    const warnKey = status.isValid ? status.expiresAt || 'unknown' : 'invalid';
    const { rows } = await query("SELECT value FROM settings WHERE key = 'fb_token_warned_for'");
    if (rows[0]?.value === warnKey) return; // already warned for this state

    const body = status.isValid
      ? `Your Facebook page token expires in ${status.daysRemaining} day${
          status.daysRemaining === 1 ? '' : 's'
        }. Generate a fresh one and update Railway before posts start failing.`
      : 'Your Facebook page token is no longer valid. Generate a fresh one and update Railway to resume posting.';

    await sendPushToAll({ title: 'Facebook token needs attention', body, url: '/' });

    await query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('fb_token_warned_for', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [warnKey]
    );
    console.log(`[cron] token warning sent (${warnKey})`);
  } catch (err) {
    console.error('[cron] token check failed:', err.message || err);
  }
}

/** Register all weekly cron jobs. Called once on app init. */
export function startScheduler() {
  for (const { expr, postType, timeKey } of JOBS) {
    cron.schedule(expr, () => runJob(postType, timeKey), { timezone: TIMEZONE });
  }
  // Daily token health check at 9am CT.
  cron.schedule('0 9 * * *', runTokenCheck, { timezone: TIMEZONE });
  console.log(`[cron] scheduler started (${JOBS.length} jobs + token check, ${TIMEZONE})`);
}
