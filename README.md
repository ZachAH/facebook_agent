# ZH Web Solutions — Facebook Automation Agent

An agentic Facebook post automation system for **ZH Web Solutions** (West Bend, WI).
A scheduled agent drafts posts with the Claude API, texts a preview to the owner via
Twilio for approval, and publishes approved posts to a Facebook Page through the Graph
API. A React dashboard serves as a secondary review/management interface.

```
backend/   Node/Express API + node-cron scheduler + Claude/Twilio/Facebook/Cloudinary services
frontend/  React + Vite dashboard (deploys to Netlify)
```

## How it works

1. **node-cron** fires Tue 7am, Wed 7am, Fri 8am (Central Time).
2. The **content agent** (`claude-sonnet-4-6`) generates a post using the saved voice
   examples as tone reference.
3. For Tech Tip Tuesday / Wait What Wednesday, **node-canvas** renders a branded
   1200×630 graphic and uploads it to Cloudinary.
4. The draft is saved (`status = pending`) and a **Twilio SMS** preview is sent to the
   owner: reply **Y** to publish, **N** to skip.
5. The Twilio reply hits `/webhook/sms`; approval triggers a **Graph API** publish.
6. The owner can also review/approve/reject/edit drafts in the **dashboard**.

Post types: `tech_tip_tuesday`, `wait_what_wednesday`, `friday_weekend` (text-only).

---

## Prerequisites

- Node.js 20+
- A Postgres database (Railway provides one)
- Accounts/keys for: Anthropic, Twilio, a Facebook Page + long-lived Page Access Token,
  Cloudinary

---

## 1. Backend — deploy to Railway

1. Create a new Railway project and add a **PostgreSQL** plugin. Railway exposes
   `DATABASE_URL` automatically.
2. Deploy the `backend/` directory. `railway.toml` sets the start command
   (`node src/index.js`) and the health check path (`/api/health`).
3. **node-canvas system deps** are provided by `nixpacks.toml` (Cairo/Pango/JPEG/GIF/SVG).
   An `Aptfile` is included as a fallback for apt-based builders.
4. The SQL migration (`src/db/migrations/001_init.sql`) runs automatically on first boot
   via `runMigrations()` in `db/client.js` (idempotent — uses `IF NOT EXISTS`).

### Backend environment variables

Copy `backend/.env.example` and fill in every value (set these in the Railway dashboard):

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Provided by Railway Postgres |
| `ANTHROPIC_API_KEY` | Anthropic console |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Twilio console |
| `TWILIO_FROM_NUMBER` | Your Twilio number, e.g. `+15555550123` |
| `OWNER_PHONE_NUMBER` | The phone that approves drafts |
| `FB_PAGE_ID` | Target Facebook Page ID |
| `FB_PAGE_ACCESS_TOKEN` | **Long-lived** Page Access Token (see note below) |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Cloudinary dashboard |
| `JWT_SECRET` | Any long random string |
| `ADMIN_PASSWORD` | Dashboard login password |
| `FRONTEND_URL` | Your Netlify URL (for CORS), e.g. `https://zh-agent.netlify.app` |
| `PORT` | Railway sets this; defaults to `3001` locally |

> **Facebook token refresh:** the app uses a static long-lived Page Access Token.
> Meta recommends refreshing roughly every 60 days. When publishing starts failing with
> an auth error, mint a fresh token and update `FB_PAGE_ACCESS_TOKEN`.
> Docs: <https://developers.facebook.com/docs/facebook-login/guides/access-tokens/#pagetokens>

---

## 2. Configure the Twilio webhook

In the Twilio console, open your number's **Messaging** settings and set
**"A message comes in"** to:

```
POST  https://<your-backend>.railway.app/webhook/sms
```

This endpoint is intentionally unauthenticated (Twilio calls it) and always replies with
empty TwiML so Twilio does not enter a retry loop.

---

## 3. Frontend — deploy to Netlify

1. Deploy the `frontend/` directory. `netlify.toml` sets the build command
   (`npm run build`), publish directory (`dist`), and the SPA redirect.
2. Set the frontend env var:

   | Variable | Value |
   | --- | --- |
   | `VITE_API_URL` | Your Railway backend URL, e.g. `https://<your-backend>.railway.app` |

3. After the backend is live, set `FRONTEND_URL` on the backend to the Netlify URL so CORS
   allows the dashboard.

---

## 4. First login

1. Open the Netlify site → you'll be redirected to `/login`.
2. Enter the value you set for `ADMIN_PASSWORD`. A JWT is stored in `localStorage`.
3. Go to **Settings → Voice examples** and paste a few real posts so the agent matches
   your tone. Confirm the schedule times and run **Test connections** to verify the
   Facebook and Twilio credentials.

---

## Local development

```bash
# Backend
cd backend
cp .env.example .env   # fill in values; point DATABASE_URL at a local/remote Postgres
npm install
npm run dev            # http://localhost:3001

# Frontend
cd ../frontend
cp .env.example .env   # set VITE_API_URL=http://localhost:3001
npm install
npm run dev            # http://localhost:5173
```

> To exercise the SMS reply flow locally, expose the backend with a tunnel
> (e.g. `ngrok http 3001`) and point the Twilio webhook at the tunnel URL.

---

## API reference

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | — | Health check (Railway) |
| POST | `/api/auth/login` | — | `{ password }` → JWT |
| GET | `/api/posts?status=` | JWT | List posts (optional status filter) |
| GET | `/api/posts/:id` | JWT | Single post |
| PATCH | `/api/posts/:id` | JWT | Edit content |
| POST | `/api/posts/:id/approve` | JWT | Approve + publish |
| POST | `/api/posts/:id/reject` | JWT | Reject |
| GET | `/api/settings` | JWT | Settings + voice examples |
| PATCH | `/api/settings` | JWT | Update settings (key/value) |
| POST | `/api/settings/voice-examples` | JWT | Add a voice example |
| DELETE | `/api/settings/voice-examples/:id` | JWT | Remove a voice example |
| GET | `/api/settings/health-check` | JWT | Test FB + Twilio credentials |
| POST | `/webhook/sms` | — | Twilio inbound SMS reply |
