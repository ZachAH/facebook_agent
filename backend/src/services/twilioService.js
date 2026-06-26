import twilio from 'twilio';
import { query } from '../db/client.js';
import { publishPost } from './facebookService.js';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const POST_TYPE_LABELS = {
  tech_tip_tuesday: 'Tech Tip Tuesday',
  wait_what_wednesday: 'Wait What Wednesday',
  friday_weekend: 'Friday',
};

/**
 * Text the owner a draft preview with approve/skip instructions, and record the
 * outgoing message SID on the post for reply matching.
 *
 * @param {{ id: number, content: string, post_type: string }} post
 */
export async function sendDraftSMS(post) {
  const label = POST_TYPE_LABELS[post.post_type] || post.post_type;
  const body = `[ZH Agent] New ${label} draft:\n\n"${post.content}"\n\nReply Y to post or N to skip.`;

  const message = await client.messages.create({
    body,
    from: process.env.TWILIO_FROM_NUMBER,
    to: process.env.OWNER_PHONE_NUMBER,
  });

  await query('UPDATE posts SET sms_sid = $1 WHERE id = $2', [message.sid, post.id]);
  return message.sid;
}

/**
 * Handle an inbound Twilio SMS reply (parsed request body).
 * Finds the most recent `pending` post, marks it approved/rejected based on the
 * reply, and publishes it to Facebook when approved.
 *
 * @param {Record<string, any>} body  Twilio-posted form fields (Body, From, ...)
 */
export async function handleReply(body) {
  const text = String(body.Body || '').trim().toLowerCase();
  const isYes = text.startsWith('y');
  const isNo = text.startsWith('n');

  if (!isYes && !isNo) {
    console.log(`[twilio] ignoring non Y/N reply: "${body.Body}"`);
    return;
  }

  const { rows } = await query(
    `SELECT * FROM posts
      WHERE status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1`
  );
  const post = rows[0];

  if (!post) {
    console.log('[twilio] reply received but no pending post to act on');
    return;
  }

  if (isYes) {
    await query("UPDATE posts SET status = 'approved' WHERE id = $1", [post.id]);
    await publishPost(post);
  } else {
    await query("UPDATE posts SET status = 'rejected' WHERE id = $1", [post.id]);
  }
}

/** Credential check for the Settings "token health" panel. */
export async function checkCredentials() {
  try {
    const account = await client.api.v2010
      .accounts(process.env.TWILIO_ACCOUNT_SID)
      .fetch();
    return { ok: account.status === 'active', status: account.status };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}
