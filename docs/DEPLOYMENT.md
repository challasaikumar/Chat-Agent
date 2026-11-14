# Deployment

## Target

- **Data:** Supabase Postgres (`DATABASE_URL`). The API is a Fastify process, not a Next.js app.
- **API:** a **long-running Node.js process** (Ubuntu VPS + `systemd`, Railway, Render, Fly.io, ...). Node.js 24, Nginx for TLS + `/api` proxy + SSE.
- **Frontend:** the Vite build (`apps/web/dist`) is static — serve it from Nginx or deploy it to Vercel (set the API origin and `APP_ALLOWED_ORIGINS` accordingly).
- OpenAI + Tavily keys on the API server only.

## Why not Vercel serverless for the API?

The agent API streams long-lived **SSE** responses (agent turns can run for minutes), keeps in-process state (search cache, rate limits, semaphores) and runs migrations on boot. Short-lived serverless functions are not a good fit. Deploy only the static Vite frontend to Vercel; run the Fastify API as a persistent process.

Because state lives in Postgres, you can run more than one API instance; in-process caches and rate limiters are per-instance.

## Layout

```
/opt/minimi/                 # app checkout
/etc/systemd/system/minimi.service
/etc/nginx/sites-available/minimi.conf
```

## Setup

```bash
git clone YOUR_PUBLIC_REPOSITORY_URL /opt/minimi
cd /opt/minimi
nvm install 24 && nvm use 24
cp .env.example .env
# Edit .env — production values:
# NODE_ENV=production
# AUTH_MODE=session
# API_HOST=127.0.0.1
# API_PORT=3001
# DATABASE_URL=postgresql://postgres.<ref>:<password>@<host>:5432/postgres   # Supabase → Project Settings → Database → Connection string (URI; Session mode 5432)
# APP_ALLOWED_ORIGINS=https://YOUR_DOMAIN
# AUTH_COOKIE_NAME=__Host-minimi_session
# OPENAI_API_KEY=...
# TAVILY_API_KEY=...
```

```bash
npm ci
npm run build
npm run db:migrate
npm run auth:bootstrap   # once, with AUTH_BOOTSTRAP_ADMIN_* set
```

Install systemd + Nginx configs from `deploy/`, then:

```bash
sudo systemctl enable --now minimi
sudo nginx -t && sudo systemctl reload nginx
./deploy/scripts/health-check.sh http://127.0.0.1:3001
```

Or use `./deploy/scripts/deploy.sh` after configuring the unit.

## Cookies / same-origin

Prefer serving UI and API on one domain (`https://YOUR_DOMAIN/` + `/api/`). Set `APP_ALLOWED_ORIGINS` to that origin. Use Secure/`__Host-` cookies over HTTPS only.

## Verification checklist

1. `/api/health` and `/api/health/ready`
2. Login + session restore
3. Conversation + streamed agent turn
4. Search when keys configured
5. SSE not buffered (watch first token)
6. Logout rejects old cookie

## Vercel (static frontend)

Deploy only `apps/web` (Vite). The API stays on Render/VPS.

1. Push the repo (includes [vercel.json](../vercel.json)).
2. [vercel.com/new](https://vercel.com/new) → import the GitHub repo.
3. Leave **Root Directory** empty (repo root). `vercel.json` sets install/build/output.
4. Environment variables (Production + Preview):

| Variable | Value |
| --- | --- |
| `VITE_API_BASE_URL` | **Leave unset / delete** — `vercel.json` proxies `/api` → Render (same-origin; cookies work) |
| `VITE_APP_NAME` | `Minimi` (optional) |

If you previously set `VITE_API_BASE_URL` to the Render URL, **remove it** and redeploy Vercel. Pointing the browser directly at Render causes CORS/cookie issues.

5. Deploy. Note the URL, e.g. `https://chat-agent.vercel.app`.
6. On the **API** (Render), set:

```env
APP_ALLOWED_ORIGINS=https://*.vercel.app
AUTH_COOKIE_NAME=minimi_session
```

Redeploy the API after changing env. Auth uses Bearer/`x-minimi-session` tokens plus cookies when same-origin.

CLI alternative from repo root:

```bash
npx vercel link
npx vercel env add VITE_API_BASE_URL production
npx vercel --prod
```

## Render (recommended PaaS for the API)

The API is a long-running Node web service. Use [render.yaml](../render.yaml).

1. Push this repo to GitHub or GitLab (Render deploys from git).
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** → connect the repo.
3. Set secret env vars when prompted (or Environment tab after create):

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase Postgres URI (Session mode / port 5432 preferred) |
| `APP_ALLOWED_ORIGINS` | Frontend origin(s). Prefer `https://*.vercel.app` so URL changes keep working |
| `OPENAI_API_KEY` or `OPENROUTER_API_KEY` | LLM key |
| `OPENAI_BASE_URL` / `OPENAI_MODEL` | If using OpenRouter |
| `TAVILY_API_KEY` | Web search |
| `AUTH_BOOTSTRAP_ADMIN_EMAIL` / `AUTH_BOOTSTRAP_ADMIN_PASSWORD` | First admin (bootstrap once) |

4. Deploy. Health check: `https://YOUR-SERVICE.onrender.com/api/health`
5. One-time admin user (Render Shell on the service, or any machine with prod `DATABASE_URL`):

```bash
npm run auth:bootstrap
```

Notes:

- Bind uses Render’s `PORT` automatically; `API_HOST=0.0.0.0`.
- Migrations run on process boot (`applyMigrations`).
- Free web services spin down when idle; prefer **Starter** for SSE agent turns.
- Cookie name stays `minimi_session` (not `__Host-`) so a separate frontend host can work later. Same-origin is still preferred when you add the UI.

Manual create (without Blueprint): **New → Web Service**, root directory blank (repo root), same build/start commands and env as `render.yaml`.

## Not deployed from this repo alone

TLS certificates, DNS, firewall, and OS user creation are operator steps. This document does not claim a live URL exists until you deploy one.
