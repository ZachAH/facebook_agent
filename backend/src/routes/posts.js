import { Router } from 'express';
import { query } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';
import { publishPost } from '../services/facebookService.js';

const router = Router();

// All post routes require a valid JWT.
router.use(requireAuth);

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
