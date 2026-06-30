import { Router } from 'express';
import { query } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';
import {
  checkConnection as checkFacebook,
  getTokenStatus as getFacebookTokenStatus,
} from '../services/facebookService.js';
import { checkCredentials as checkTwilio } from '../services/twilioService.js';

const router = Router();

router.use(requireAuth);

/** GET /api/settings — all settings + all voice examples. */
router.get('/', async (_req, res) => {
  try {
    const [{ rows: settings }, { rows: voiceExamples }] = await Promise.all([
      query('SELECT key, value, updated_at FROM settings ORDER BY key'),
      query('SELECT id, content, created_at FROM voice_examples ORDER BY created_at DESC'),
    ]);
    res.json({ settings, voiceExamples });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /api/settings — upsert one or more key/value pairs. */
router.patch('/', async (req, res) => {
  const updates = req.body || {};
  const keys = Object.keys(updates);
  if (keys.length === 0) {
    return res.status(400).json({ error: 'No settings provided' });
  }
  try {
    for (const key of keys) {
      await query(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, String(updates[key])]
      );
    }
    const { rows } = await query('SELECT key, value, updated_at FROM settings ORDER BY key');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/settings/voice-examples — add a voice example. */
router.post('/voice-examples', async (req, res) => {
  const { content } = req.body || {};
  if (typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'content is required' });
  }
  try {
    const { rows } = await query(
      'INSERT INTO voice_examples (content) VALUES ($1) RETURNING id, content, created_at',
      [content.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/settings/voice-examples/:id — remove a voice example. */
router.delete('/voice-examples/:id', async (req, res) => {
  try {
    const { rowCount } = await query('DELETE FROM voice_examples WHERE id = $1', [
      req.params.id,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: 'Voice example not found' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/settings/health-check — test FB + Twilio credentials. */
router.get('/health-check', async (_req, res) => {
  const [facebook, facebookToken, twilio] = await Promise.all([
    checkFacebook(),
    getFacebookTokenStatus(),
    checkTwilio(),
  ]);
  res.json({ facebook: { ...facebook, token: facebookToken }, twilio });
});

export default router;
