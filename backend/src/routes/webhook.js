import { Router } from 'express';
import { handleReply } from '../services/twilioService.js';

const router = Router();

/**
 * POST /webhook/sms — Twilio inbound SMS webhook (no JWT; Twilio calls this).
 * Processes the reply, then always returns 200 with empty TwiML so Twilio does
 * not enter a retry loop.
 */
router.post('/', async (req, res) => {
  // Respond immediately; do the work without blocking the TwiML acknowledgement.
  try {
    await handleReply(req.body || {});
  } catch (err) {
    console.error('[webhook] handleReply failed:', err.message || err);
  }
  res.set('Content-Type', 'text/xml');
  res.send('<Response></Response>');
});

export default router;
