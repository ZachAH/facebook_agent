import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { runMigrations } from './db/client.js';
import { startScheduler } from './cron/scheduler.js';

import authRoutes from './routes/auth.js';
import postRoutes from './routes/posts.js';
import settingsRoutes from './routes/settings.js';
import webhookRoutes from './routes/webhook.js';

const app = express();
const PORT = process.env.PORT || 3001;

// CORS — allow the Netlify frontend (FRONTEND_URL). Falls back to permissive in
// local dev when FRONTEND_URL is unset.
app.use(
  cors({
    origin: process.env.FRONTEND_URL || true,
  })
);

// Twilio posts application/x-www-form-urlencoded; the API speaks JSON.
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Health check for Railway.
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// API routes (JWT-protected except auth/login).
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/settings', settingsRoutes);

// Twilio webhook — no JWT.
app.use('/webhook/sms', webhookRoutes);

async function start() {
  await runMigrations();
  startScheduler();
  app.listen(PORT, () => console.log(`[server] listening on :${PORT}`));
}

start().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
