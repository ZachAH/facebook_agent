import webpush from 'web-push';
import { query } from '../db/client.js';

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL}`,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const TYPE_LABELS = {
  tech_tip_tuesday: 'Tech Tip Tuesday',
  wait_what_wednesday: 'Wait What Wednesday',
  friday_weekend: 'Friday Feel-Good',
};

/**
 * Send a push notification to every registered device. Prunes subscriptions
 * the push service reports as gone (404/410). Shared by draft + system alerts.
 */
export async function sendPushToAll({ title, body, url = '/' }) {
  const { rows } = await query('SELECT sub_json, id FROM push_subscriptions');
  if (!rows.length) return;

  const payload = JSON.stringify({ title, body, url });

  const dead = [];
  await Promise.allSettled(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(JSON.parse(row.sub_json), payload);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          dead.push(row.id);
        }
      }
    })
  );

  if (dead.length) {
    await query(`DELETE FROM push_subscriptions WHERE id = ANY($1)`, [dead]);
  }
}

export async function sendDraftNotification(post) {
  const label = TYPE_LABELS[post.post_type] || post.post_type;
  await sendPushToAll({
    title: `New ${label} draft ready`,
    body: post.content.slice(0, 100) + (post.content.length > 100 ? '…' : ''),
    url: '/',
  });
}
