import cron from 'node-cron';
import { query } from '../db/client.js';
import { generatePost } from '../agents/contentAgent.js';
import { generateImage } from '../services/imageService.js';
import { sendDraftSMS } from '../services/twilioService.js';

const TIMEZONE = 'America/Chicago'; // Central Time

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
    const content = await generatePost(postType);
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
      await sendDraftSMS(post);
    }

    console.log(`[cron] ${postType} draft saved (post ${post.id})`);
  } catch (err) {
    console.error(`[cron] ${postType} job failed:`, err.message || err);
  }
}

/** Register all weekly cron jobs. Called once on app init. */
export function startScheduler() {
  for (const { expr, postType, timeKey } of JOBS) {
    cron.schedule(expr, () => runJob(postType, timeKey), { timezone: TIMEZONE });
  }
  console.log(`[cron] scheduler started (${JOBS.length} jobs, ${TIMEZONE})`);
}
