import { Router } from 'express';
import { verifyActionToken } from '../middleware/auth.js';
import { approveAndPublish, rejectDraft } from '../services/postActionService.js';

const router = Router();
const ACTIONS = new Set(['approve', 'reject']);

/**
 * POST /api/post-actions/:action?token=…
 *
 * One-tap approve/reject from a push notification. Authenticated by the signed
 * action token (which encodes the post id), NOT a login — so the service worker
 * can act without opening the app. Deliberately mounted outside requireAuth.
 */
router.post('/:action', async (req, res) => {
  const { action } = req.params;
  const token = req.query.token || req.body?.token;

  if (!ACTIONS.has(action)) {
    return res.status(400).json({ error: 'Unknown action' });
  }
  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  let postId;
  try {
    ({ postId } = verifyActionToken(token));
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const result =
      action === 'approve' ? await approveAndPublish(postId) : await rejectDraft(postId);
    if (result.notFound) return res.status(404).json(result);
    return res.json({ action, ...result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
