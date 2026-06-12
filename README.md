# ArkenEdu

A multi-tenant school management SaaS — admin web portal, parent/teacher web portal, and a React Native mobile app — backed by a single FastAPI service.

ArkenEdu covers the day-to-day workflows a 50–2,000 student school actually runs on: attendance, marks, announcements with homework confirmation, fee collection (parent UPI with admin verification + admin-recorded cash/manual UPI), transport tracking, timetables, parent communication (push + voice), and AI-assisted lesson planning / question generation.

- **Backend:** Python 3.11 / FastAPI / SQLAlchemy 2 (async) / Alembic / PostgreSQL / Redis
- **Web frontend:** React 19 / Vite / TypeScript / Tailwind v4
- **Mobile:** Expo SDK 54 / React Native 0.81 / expo-router
- **Infra:** AWS — EC2 running the Docker Compose stack + RDS Postgres, behind host nginx (TLS via certbot). The web SPA is a static Vite build served by nginx on the same box. Full runbook in [`README-AWS.md`](README-AWS.md).

---

## Table of contents

1. [Repository layout](#repository-layout)
2. [Architecture](#architecture)
3. [Local setup](#local-setup)
4. [Running the test suite](#running-the-test-suite)
5. [Deployment](#deployment)
6. [Environment variables](#environment-variables)
7. [Operational notes](#operational-notes)
8. [Contributing](#contributing)

---

## Repository layout

```
SCHOOL/
├── backend/              # FastAPI service (web + cron worker)
│   ├── app/
│   │   ├── api/routes/   # HTTP routers, grouped by feature
│   │   ├── core/         # config, db, security, logger, websocket, rate-limiter
│   │   ├── models/       # SQLAlchemy ORM models
│   │   ├── schemas/      # Pydantic request/response models
│   │   └── services/     # business logic (auth, finance, storage, push, ...)
│   ├── alembic/          # database migrations (42+ revisions)
│   ├── tests/            # 100+ pytest cases (auth, websockets, storage, ...)
│   ├── gunicorn_conf.py  # production worker config
│   ├── worker.py         # background scheduler entrypoint
│   └── Dockerfile
│
├── frontend/             # React SPA — admin, teacher, parent portals
│   └── src/
│       ├── features/     # feature-sliced (attendance, marks, finance, ...)
│       ├── shared/       # api client, contexts, ui primitives
│       └── App.tsx
│
├── mobile/               # Expo React Native app (parent/teacher)
│   ├── app/              # expo-router screens
│   ├── features/         # parallel feature slices
│   └── services/         # shared mobile services (push, auth, api)
│
├── deployment/             # nginx config, reverse-proxy templates
├── docker-compose.yml      # local dev stack (Postgres + Redis + API + worker)
├── docker-compose.prod.yml # production stack (EC2 + RDS: Redis + API + worker)
├── README-AWS.md           # production AWS (EC2 + RDS) deployment guide
└── docs/                   # one-pager, demo script, internal docs
```

---

## Architecture

```
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ Web SPA (static) │   │ Mobile (Expo)    │   │ Admin scripts /  │
│ React 19 + Vite  │   │ React Native     │   │ cron (systemd)   │
└─────────┬────────┘   └─────────┬────────┘   └─────────┬────────┘
          │ HTTPS                │ HTTPS                │ HTTPS
          │ HttpOnly cookies     │ Bearer tokens        │ X-Cron-Secret
          └──────────────────────┼──────────────────────┘
                                 ▼
                     ┌──────────────────────┐
                     │  FastAPI (gunicorn + │
                     │  UvicornWorker)      │
                     │                      │
                     │  ┌────────────────┐  │
                     │  │ Web replicas   │  │
                     │  │   ├ HTTP API   │  │
                     │  │   ├ WebSockets │  │
                     │  │   └ /health    │  │
                     │  └────────────────┘  │
                     │  ┌────────────────┐  │
                     │  │ Worker replica │  │
                     │  │  fee reminders │  │
                     │  └────────────────┘  │
                     └─────┬──────────┬─────┘
                           │          │
                ┌──────────▼──┐   ┌───▼─────────┐    ┌──────────────┐
                │ Postgres    │   │ Redis       │    │ AWS S3       │
                │ (AWS RDS)   │   │ rate-limit  │    │ uploads +    │
                │             │   │ + pub/sub   │    │ presigned    │
                │             │   │ + WS fanout │    │ URLs (1h)    │
                └─────────────┘   └─────────────┘    └──────────────┘

External integrations: Twilio (voice calls), Expo Push (mobile notifications),
Google Gemini + OpenAI (AI lesson plans and question bank), Sentry
(error tracking). Fee payments are UPI-only — parents pay into the school's
UPI/bank account out-of-band and submit the UTR for admin verification.
```

**Multi-tenancy.** Every authenticated request carries an `X-Institution-Id` header that the backend resolves (slug or numeric PK) against the `institutions` table. The institution id is also embedded in the JWT so a tenant claim is always available even if the header is spoofed. Super-admin is the only role that crosses tenants.

**Auth.** HttpOnly cookies for the web SPA (token never reachable from JavaScript — XSS-resistant). Bearer tokens for mobile (stored in `expo-secure-store`). Account lockout after 5 failed logins. Bcrypt runs in a thread pool so it never stalls the async event loop.

**Storage.** All uploads go to AWS S3 and are served via short-lived presigned URLs. Local disk is used only in dev and is rejected at startup in production. Legacy Cloudinary URLs still resolve via passthrough for older rows.

**Scheduling.** A dedicated worker container runs the in-process Wednesday fee-reminder scheduler. Web replicas keep `FEE_REMINDER_SCHEDULER_ENABLED=false` so scaling out the API doesn't spawn duplicate cron jobs. A `cron_locks` table provides defense-in-depth against double-dispatch.

---

## Local setup

### Prerequisites

- Python 3.11
- Node.js 20+
- Docker + Docker Compose (recommended) **or** a local Postgres 15 + Redis 7

### Quick start (Docker Compose)

```bash
git clone https://github.com/<your-org>/edutrack.git
cd edutrack

cp backend/.env.example backend/.env
# Edit backend/.env — at minimum, set:
#   SECRET_KEY (32+ random chars)
#   DATABASE_URL (leave default to use the compose-managed Postgres)

docker compose up --build
```

This brings up:
- `db` — Postgres 15 on `localhost:5432`
- `redis` — Redis 7
- `backend` — FastAPI on `localhost:8000` with hot-reload (host code mounted into the container)
- `worker` — background scheduler

Apply migrations and seed demo data the first time:

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python seed.py
```

Then start the web frontend:

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

And — optionally — the mobile app:

```bash
cd mobile
npm install
npx expo start   # press i (iOS) or a (Android)
```

### Bare-metal setup

If you don't want Docker:

```bash
# Backend
cd backend
python3.11 -m venv venv && source venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env  # configure DATABASE_URL + SECRET_KEY
alembic upgrade head
python seed.py
uvicorn app.main:app --reload     # localhost:8000

# Frontend (separate terminal)
cd ../frontend && npm install && npm run dev
```

### Default demo credentials

After running `seed.py`:

| Role         | Email                  | Password   |
| ------------ | ---------------------- | ---------- |
| Super-admin  | `super@edutrack.dev`   | `super123` |
| School admin | `admin@demo.school`    | `admin123` |
| Teacher      | `teacher@demo.school`  | `teach123` |
| Parent       | (use phone + DOB flow) | —          |

> Demo credentials only exist when `ENVIRONMENT != prod`. Seed refuses to run against a production DB.

---

## Running the test suite

### Backend

```bash
cd backend
source venv/bin/activate
python -m pytest tests/ -v
```

Tests use SQLite via `aiosqlite` so they're hermetic and run in <30 seconds. CI runs the same command on every PR (see `.github/workflows/backend-ci.yml`).

### Frontend

```bash
cd frontend
npm run lint        # eslint
npm run build       # tsc -b && vite build (typecheck + bundle)
```

Both run in CI on every PR (`.github/workflows/frontend-ci.yml`).

### Manual / smoke

A `verify` skill in `.claude/` documents the manual happy-path checks for each major feature. For a release candidate, run through the demo script in [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md).

---

## Deployment

Production runs on **AWS EC2 + RDS** (live at `api.arkenedu.com` / `www.arkenedu.com`).

- **Backend** → the prod Docker Compose stack ([`docker-compose.prod.yml`](docker-compose.prod.yml): `backend` + `worker` + `redis`) on a single Ubuntu EC2 box. Run `docker compose -f docker-compose.prod.yml up -d --build`; migrations apply via `docker compose -f docker-compose.prod.yml run --rm backend alembic upgrade head`.
- **Database** → AWS RDS PostgreSQL. The `DATABASE_URL` lives in `backend/.env` on the server (never committed).
- **Edge / TLS** → host nginx terminates HTTPS (Let's Encrypt via certbot) and reverse-proxies `api.arkenedu.com` → `127.0.0.1:8000`.
- **Cron** → the `worker` container owns the fee-reminder scheduler. An optional external cron can hit `/api/finance/fee-reminders/dispatch` with `X-Cron-Secret`.
- **Frontend** → static Vite build served by nginx (same box). Set `VITE_API_BASE_URL=https://api.arkenedu.com/api`.

Pushing to `main` triggers [`.github/workflows/deploy-prod.yml`](.github/workflows/deploy-prod.yml), which:
1. Runs `gitleaks` + `pip-audit`.
2. SSHes into the EC2 box, pulls `main`, rebuilds the image, runs `alembic upgrade head`, and `docker compose up -d`.
3. Polls `/health` to confirm the rollout.

Full step-by-step runbook (provisioning EC2 + RDS + S3, nginx + certbot, DNS): [`README-AWS.md`](README-AWS.md).

---

## Environment variables

The full list with descriptions lives in [`backend/app/core/config.py`](backend/app/core/config.py). The ones you must set in production:

| Variable | Purpose |
| --- | --- |
| `SECRET_KEY` | JWT signing — 32+ random chars. Generate with `python -c 'import secrets; print(secrets.token_urlsafe(32))'`. |
| `DATABASE_URL` | `postgresql+asyncpg://user:pass@host:port/db` |
| `REDIS_URL` | `redis://...` — required for multi-replica rate limiting and websocket pub/sub. |
| `FRONTEND_URL` | The web SPA's URL (e.g. `https://www.arkenedu.com`) — used for CORS allow-list and email links. |
| `ENVIRONMENT` | `prod` enables HSTS, secure cookies, and strict storage/credential checks. |
| `AWS_S3_BUCKET` + `AWS_S3_REGION` + `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | S3 is the only supported storage backend in prod. Startup hard-fails if these are unset. |
| `CRON_SECRET` | Shared secret for the fee-reminder cron job. |

Optional but recommended:

| Variable | Purpose |
| --- | --- |
| `SENTRY_DSN` | Error aggregation. |
| `TWILIO_*` | Outbound voice calls for fee reminders. Silent no-op when unset. |
| `EXPO_ACCESS_TOKEN` | Required only if you've enabled Enhanced Push Security in Expo. |
| `GOOGLE_API_KEY` / `OPENAI_API_KEY` | AI lesson plan / question bank generation. |

---

## Operational notes

- **Health endpoints:** `GET /health` (no DB) and `GET /ready` (validates DB). Use `/health` for liveness probes, `/ready` for readiness.
- **Logs:** structured JSON in prod (`LOG_JSON=true` by default when `ENVIRONMENT=prod`), human-readable in dev. Every line carries `request_id` so you can grep one tag end-to-end.
- **Rate limiting:** slowapi with Redis backend. Falls back to in-memory per-worker counters when `REDIS_URL` is unset — fine for a single replica, not fine in prod.
- **Backups:** enable RDS automated backups (PITR) and a sensible retention window; optionally add a weekly logical `pg_dump` to S3 for off-site recovery.
- **Migrations:** never edit a merged Alembic revision in place. Add a new revision instead. The deploy pipeline runs `alembic upgrade head` before booting workers.

---

## Contributing

1. Branch off `main`. Keep PRs focused — one feature or fix per PR.
2. Both CI workflows must pass before merge.
3. New backend behaviour needs a pytest case in `backend/tests/`.
4. Public-facing copy is India-first today (INR, IST timezone, Twilio `en-IN`). Localise behind config rather than hardcoding new strings.
5. Never commit `.env` files. `.env.example` is the canonical template.

---

## License

Proprietary — © ArkenEdu. All rights reserved.
