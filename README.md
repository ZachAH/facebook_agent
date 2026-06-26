# ZH Web Solutions — Facebook Automation Agent

An AI-powered Facebook post automation system for **ZH Web Solutions** (West Bend, WI). A scheduled agent drafts posts using the Claude API, sends a push notification to your phone for approval, and publishes approved posts directly to your Facebook Page via the Graph API. A React PWA dashboard lets you review, edit, approve, or generate posts from anywhere — including over cellular.

---

## How it works

1. **node-cron** fires automatically on Tuesday 7am, Wednesday 7am, and Friday 8am (Central Time)
2. The **Claude agent** (`claude-sonnet-4-6`) generates a post using your real ZH Web Solutions Facebook posts as tone reference
3. For TTT and WWW posts, **node-canvas** renders a branded 1200×630 graphic and uploads it to Cloudinary
4. The draft is saved as `pending` and a **push notification** is sent to any device where you've enabled notifications
5. Tap the notification → opens the dashboard → approve to publish live to Facebook, or reject/edit
6. You can also generate posts manually from the dashboard anytime

### Post types

| Day | Type | Description | Image |
|---|---|---|---|
| Tuesday | Tech Tip Tuesday | Practical web/tech tip for small business owners | Branded graphic |
| Wednesday | Wait What Wednesday | Surprising fact about websites or SEO | Branded graphic |
| Friday | Friday Feel-Good | Warm weekend send-off, local WI flavor | Text only |
| Anytime | General Post | Conversational, unthemed — client wins, observations, questions | Text only |

---

## Stack

**Backend** — Node.js 20 (ESM), Express, node-cron, PostgreSQL (pg), Anthropic SDK, node-canvas, Cloudinary, web-push, Twilio (optional SMS)

**Frontend** — React 18, Vite, Axios, React Router v6, PWA (installable on phone + desktop)

**Infrastructure** — Railway (backend + Postgres), Netlify (frontend)

---

## Live URLs

| | URL |
|---|---|
| Dashboard | https://zh-agent-zach.netlify.app |
| Backend API | https://facebookagent-production.up.railway.app |

---

## Local development

### Prerequisites
- Node.js 20+
- A Railway Postgres database (or local Postgres)
- API keys for: Anthropic, Facebook (Page Access Token), Cloudinary
- Optional: Twilio for SMS approvals

### Backend

```bash
cd backend
cp .env.example .env   # fill in all values
npm install
npm run dev            # starts on http://localhost:3001
```

### Frontend

```bash
cd frontend
# .env already set to point at localhost:3001
npm install
npm run dev            # starts on http://localhost:5173
```

### Import your voice examples

Pull your existing Facebook Page posts into the database so Claude learns your tone:

```bash
cd backend
npm run import:voice
```

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Railway → Postgres plugin → Variables |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `TWILIO_ACCOUNT_SID` | console.twilio.com → Account Info (starts with AC) |
| `TWILIO_AUTH_TOKEN` | console.twilio.com → Account Info |
| `TWILIO_FROM_NUMBER` | Your Twilio phone number |
| `OWNER_PHONE_NUMBER` | Your phone number for SMS approvals |
| `FB_PAGE_ID` | Your Facebook Page ID (not personal profile) |
| `FB_PAGE_ACCESS_TOKEN` | Long-lived Page Access Token from Graph API Explorer |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | cloudinary.com → Dashboard |
| `JWT_SECRET` | Any long random string |
| `ADMIN_PASSWORD` | Your dashboard login password |
| `FRONTEND_URL` | Your Netlify URL (for CORS) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Generate with `node -e "import('web-push').then(m=>{ const k=m.default.generateVAPIDKeys(); console.log(k) })"` |
| `VAPID_EMAIL` | Your email address |

### Frontend (`frontend/.env`)

| Variable | Value |
|---|---|
| `VITE_API_URL` | Your Railway backend URL |

---

## Dashboard features

- **Pending Drafts** — review and approve/reject AI-generated posts before they go live
- **Inline editing** — click any post body to edit before approving
- **Generate Draft** — pick a post type and generate on demand
- **🎲 Random** — generate a random variation of the currently selected post type
- **History** — all published and rejected posts with links to live Facebook posts
- **Settings** — adjust schedule times, manage voice examples, test connections
- **Push notifications** — enable per device; works on phone over cellular once deployed

## PWA install

Open the dashboard in your mobile browser:
- **iPhone**: Share → Add to Home Screen
- **Android**: Menu → Install App

After installing, push notifications work even when the app isn't open.

---

## Deployment

### Backend → Railway

1. Create a new service in your Railway project → GitHub Repo → `ZachAH/facebook_agent`
2. Set Root Directory to `backend`
3. Add all environment variables in the Variables tab
4. Generate a public domain (Settings → Networking → Generate Domain → port **8080**)

> Railway auto-deploys on every push to `main`

### Frontend → Netlify

```bash
cd frontend
npm run build
netlify deploy --prod --dir dist
```

Or connect the repo to Netlify for automatic deploys on push.

After deploying both, update:
- Railway: set `FRONTEND_URL` to your Netlify URL
- Netlify: set `VITE_API_URL` to your Railway URL, then redeploy

---

## Facebook token refresh

The app uses a long-lived Page Access Token which expires every ~60 days. When publishing fails with an auth error, generate a fresh token in the [Graph API Explorer](https://developers.facebook.com/tools/explorer/) and update `FB_PAGE_ACCESS_TOKEN` in Railway.

---

## API reference

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | — | Health check |
| POST | `/api/auth/login` | — | `{ password }` → JWT |
| GET | `/api/posts?status=` | JWT | List posts |
| PATCH | `/api/posts/:id` | JWT | Edit content |
| POST | `/api/posts/:id/approve` | JWT | Approve + publish to Facebook |
| POST | `/api/posts/:id/reject` | JWT | Reject draft |
| POST | `/api/posts/generate` | JWT | `{ type }` → generate a draft now |
| GET | `/api/settings` | JWT | Get settings + voice examples |
| PATCH | `/api/settings` | JWT | Update settings |
| POST | `/api/settings/voice-examples` | JWT | Add voice example |
| DELETE | `/api/settings/voice-examples/:id` | JWT | Remove voice example |
| GET | `/api/settings/health-check` | JWT | Test Facebook + Twilio connections |
| GET | `/api/notifications/vapid-public-key` | JWT | Get VAPID public key |
| POST | `/api/notifications/subscribe` | JWT | Register push subscription |
| POST | `/api/notifications/unsubscribe` | JWT | Remove push subscription |
| POST | `/webhook/sms` | — | Twilio inbound SMS reply handler |
