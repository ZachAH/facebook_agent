import { Router } from 'express';
import { query } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';
import { approveAndPublish, rejectDraft } from '../services/postActionService.js';
import { generatePost } from '../agents/contentAgent.js';
import { generateImage } from '../services/imageService.js';
import { sendDraftSMS } from '../services/twilioService.js';
import { sendDraftNotification } from '../services/notificationService.js';
import { attachDraftQuality, evaluateDraftQuality } from '../services/draftQualityService.js';

const router = Router();

// All post routes require a valid JWT.
router.use(requireAuth);

const VALID_TYPES = ['tech_tip_tuesday', 'wait_what_wednesday', 'friday_weekend', 'general'];

function countMap(rows, key = 'status') {
  return rows.reduce((acc, row) => {
    acc[row[key]] = Number(row.count);
    return acc;
  }, {});
}

/**
 * POST /api/posts/generate
 * Manually trigger a draft (same logic as the cron job). Body: { type }
 */
router.post('/generate', async (req, res) => {
  const { type, topic } = req.body || {};
  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
  }
  if (topic !== undefined && typeof topic !== 'string') {
    return res.status(400).json({ error: 'topic must be a string' });
  }
  try {
    const content = await generatePost(type, topic);
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

    res.json({ ...post, quality: await evaluateDraftQuality(post) });
  } catch (err) {
    console.error('[generate]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/posts/metrics
 * Lightweight production signals for the dashboard and interview demo.
 */
router.get('/metrics', async (_req, res) => {
  try {
    const [statusResult, typeResult, latencyResult, failedResult] = await Promise.all([
      query('SELECT status, COUNT(*)::int AS count FROM posts GROUP BY status'),
      query(
        `SELECT post_type, status, COUNT(*)::int AS count
           FROM posts
          GROUP BY post_type, status
          ORDER BY post_type, status`
      ),
      query(
        `SELECT AVG(EXTRACT(EPOCH FROM (published_at - created_at)) / 60)::float AS minutes
           FROM posts
          WHERE status = 'published'
            AND published_at IS NOT NULL`
      ),
      query(
        `SELECT id, post_type, error_message, created_at
           FROM posts
          WHERE status = 'failed'
          ORDER BY created_at DESC
          LIMIT 3`
      ),
    ]);

    const totals = countMap(statusResult.rows);
    const totalPosts = Object.values(totals).reduce((sum, count) => sum + count, 0);
    const resolvedCount = (totals.published || 0) + (totals.rejected || 0) + (totals.failed || 0);
    const approvalRate = resolvedCount
      ? Math.round(((totals.published || 0) / resolvedCount) * 100)
      : null;
    const failureRate = resolvedCount
      ? Math.round(((totals.failed || 0) / resolvedCount) * 100)
      : null;

    const byTypeMap = new Map();
    for (const row of typeResult.rows) {
      if (!byTypeMap.has(row.post_type)) {
        byTypeMap.set(row.post_type, {
          postType: row.post_type,
          total: 0,
          pending: 0,
          approved: 0,
          published: 0,
          rejected: 0,
          failed: 0,
        });
      }
      const bucket = byTypeMap.get(row.post_type);
      bucket[row.status] = Number(row.count);
      bucket.total += Number(row.count);
    }

    res.json({
      totals: {
        total: totalPosts,
        pending: totals.pending || 0,
        approved: totals.approved || 0,
        published: totals.published || 0,
        rejected: totals.rejected || 0,
        failed: totals.failed || 0,
      },
      approvalRate,
      failureRate,
      avgPublishMinutes: latencyResult.rows[0]?.minutes ?? null,
      byType: Array.from(byTypeMap.values()),
      recentFailures: failedResult.rows,
    });
  } catch (err) {
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
    res.json(await attachDraftQuality(result.rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/posts/:id — single post. */
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Post not found' });
    res.json({ ...rows[0], quality: await evaluateDraftQuality(rows[0]) });
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
    res.json({ ...rows[0], quality: await evaluateDraftQuality(rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/posts/:id/approve — approve + publish from the dashboard. */
router.post('/:id/approve', async (req, res) => {
  try {
    const result = await approveAndPublish(req.params.id);
    if (result.notFound) return res.status(404).json({ error: 'Post not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/posts/:id/reject — reject from the dashboard. */
router.post('/:id/reject', async (req, res) => {
  try {
    const result = await rejectDraft(req.params.id);
    if (result.notFound) return res.status(404).json({ error: 'Post not found' });
    res.json(result.post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
