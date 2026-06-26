import { Router } from 'express';
import { query } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';
import { publishPost } from '../services/facebookService.js';
import { generatePost } from '../agents/contentAgent.js';
import { generateImage } from '../services/imageService.js';
import { sendDraftSMS } from '../services/twilioService.js';
import { sendDraftNotification } from '../services/notificationService.js';

const router = Router();

// All post routes require a valid JWT.
router.use(requireAuth);

const VALID_TYPES = ['tech_tip_tuesday', 'wait_what_wednesday', 'friday_weekend'];

/**
 * POST /api/posts/generate
 * Manually trigger a draft (same logic as the cron job). Body: { type }
 */
router.post('/generate', async (req, res) => {
  const { type } = req.body || {};
  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
  }
  try {
    const content = await generatePost(type);
    const imageUrl = await generateImage(type, content);

    const { rows } = await query(
      `INSERT INTO posts (content, image_url, post_type, status)
       VALUES ($1, $2, $3, 'pending') RETURNING *`,
      [content, imageUrl, type]
    );
    const post = rows[0];

    const { rows: smsRows } = await query("SELECT value FROM settings WHERE key = 'sms_active'");
    if (smsRows[0]?.value === 'true') {
      try {
        await sendDraftSMS(post);
      } catch (smsErr) {
        console.warn('[generate] SMS send failed (post still saved):', smsErr.message);
      }
    }

    // Push notification (non-fatal)
    sendDraftNotification(post).catch((err) =>
      console.warn('[generate] push notification failed:', err.message)
    );

    res.json(post);
  } catch (err) {
    console.error('[generate]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/posts
 * Optional ?status=pending filter. Sorted newest-first.
 */
router.get('/', async (req, res) => {
  const { status } = req.query;
  try {
    const result = status
      ? await query(
          'SELECT * FROM posts WHERE status = $1 ORDER BY created_at DESC',
          [status]
        )
      : await query('SELECT * FROM posts ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/posts/:id — single post. */
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Post not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /api/posts/:id — update content (inline editing). */
router.patch('/:id', async (req, res) => {
  const { content } = req.body || {};
  if (typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'content is required' });
  }
  try {
    const { rows } = await query(
      'UPDATE posts SET content = $1 WHERE id = $2 RETURNING *',
      [content, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Post not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/posts/:id/approve — approve + publish from the dashboard. */
router.post('/:id/approve', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
    const post = rows[0];
    if (!post) return res.status(404).json({ error: 'Post not found' });

    await query("UPDATE posts SET status = 'approved' WHERE id = $1", [post.id]);
    const result = await publishPost(post);

    const { rows: updated } = await query('SELECT * FROM posts WHERE id = $1', [post.id]);
    res.json({ ...result, post: updated[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/posts/:id/reject — reject from the dashboard. */
router.post('/:id/reject', async (req, res) => {
  try {
    const { rows } = await query(
      "UPDATE posts SET status = 'rejected' WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Post not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
