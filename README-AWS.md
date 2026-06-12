# ArkenEdu — AWS Deployment Guide (EC2 + RDS)

End-to-end runbook for the production stack: the backend Docker Compose stack
(**FastAPI + worker + Redis**) on a single **EC2** box, talking to **RDS
PostgreSQL**, with **S3** for uploads, fronted by **host nginx** terminating
TLS (Let's Encrypt / certbot). This is what actually serves
`api.arkenedu.com` + `www.arkenedu.com` today.

> **Audience**: someone with an AWS account, billing enabled, a registered
> domain, and basic SSH/Linux comfort. Every step has the exact command.

> **Why EC2 + Docker Compose (not Fargate/EKS)?** One box runs the whole stack
> with `docker compose up`, costs a fraction of Fargate+ALB, and is trivial to
> SSH into and debug. It does NOT auto-scale or self-heal a dead instance — for
> a single-school SaaS that's an acceptable trade. If you outgrow one box,
> §13 sketches the path to an ALB + Auto Scaling Group.

---

## 0. Target Architecture

```
                ┌────────────────────────────────────────────────┐
                │  Browser (admin/parent/teacher) + Expo mobile  │
                └─────────────────────┬──────────────────────────┘
                                      │  HTTPS
                                      ▼
                         ┌────────────────────────┐
                         │  DNS (Route 53 / your  │
                         │  registrar)            │
                         │  api.arkenedu.com ─┐   │
                         │  www.arkenedu.com ─┤   │
                         └────────────────────┼───┘
                                              ▼  → EC2 Elastic IP
       ┌───────────────────────────────────────────────────────────┐
       │  EC2 (Ubuntu)                                              │
       │                                                           │
       │  host nginx (:80/:443, TLS via certbot)                   │
       │    • www.arkenedu.com → static SPA (frontend/dist)        │
       │    • api.arkenedu.com → 127.0.0.1:8000                    │
       │                       │                                   │
       │                       ▼                                   │
       │  Docker Compose (docker-compose.prod.yml)                 │
       │    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
       │    │ backend      │  │ worker       │  │ redis        │   │
       │    │ gunicorn     │  │ fee-reminder │  │ rate-limit + │   │
       │    │ :8000 (loop) │  │ scheduler    │  │ pub/sub      │   │
       │    └──────┬───────┘  └──────┬───────┘  └──────────────┘   │
       └───────────┼─────────────────┼───────────────────────────┘
                   │                 │
        ┌──────────▼─────────┐   ┌───▼──────────────┐
        │  RDS PostgreSQL    │   │  S3 (uploads)    │
        │  (private subnet)  │   │  presigned URLs  │
        └────────────────────┘   └──────────────────┘
```

- **Redis** runs as a local container (ephemeral by design). Swap `REDIS_URL`
  for an **ElastiCache** endpoint later if you want managed Redis — see §12.
- **The DB is RDS**, not a container. `DATABASE_URL` lives only in
  `backend/.env` on the box.

---

## 1. Costs (ap-south-1, approximate — verify before you commit)

| Service | Size | Monthly |
|---------|------|---------|
| EC2 `t3.small` (2 vCPU, 2 GB) On-Demand | always-on | ~$15 |
| EBS gp3 root volume | 30 GiB | ~$3 |
| RDS Postgres `db.t4g.micro` (Single-AZ) | 20 GB gp3 | ~$15 |
| RDS Multi-AZ (optional, doubles DB cost) | +failover | +~$15 |
| Elastic IP (while attached) | 1 | free |
| S3 + data transfer | low | ~$3 |
| **Baseline total (Single-AZ)** |   | **~$36 /mo** |

`t3.small` is the smallest box that comfortably runs gunicorn (2 workers) +
worker + redis. A `t3.micro` (1 GB) works for a demo but will swap under load.

> **Free Tier**: a brand-new account gets 12 months of `t3.micro`/`t2.micro`
> (750 hr/mo) + `db.t4g.micro` (750 hr/mo) + 20 GB RDS storage. You can run the
> whole thing near-free for the first year if you stay on micro instances.

---

## 2. Prerequisites

```bash
# AWS CLI v2
aws --version           # aws-cli/2.x

# Configure credentials (an IAM user with the needed perms; AdministratorAccess
# is fine for first setup — tighten later).
aws configure
#   Default region: ap-south-1   (Mumbai — India-first product, UPI/INR/IST)

export AWS_REGION=ap-south-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "Account $AWS_ACCOUNT_ID in $AWS_REGION"
```

You also need a registered domain (e.g. `arkenedu.com`) you can point at an
Elastic IP.

---

## 3. Networking — VPC + Security Groups

The default VPC is fine for a single-box deploy. You need two security groups:

| SG name | Inbound | Purpose |
|---------|---------|---------|
| `edutrack-ec2-sg` | 22 from **your IP only**, 80 + 443 from `0.0.0.0/0` | the EC2 box |
| `edutrack-db-sg`  | 5432 from `edutrack-ec2-sg` **only** | RDS Postgres |

```bash
export VPC_ID=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' --output text)

# EC2 SG
aws ec2 create-security-group --group-name edutrack-ec2-sg \
  --description "ArkenEdu EC2" --vpc-id $VPC_ID
export EC2_SG=$(aws ec2 describe-security-groups --filters Name=group-name,Values=edutrack-ec2-sg \
  --query 'SecurityGroups[0].GroupId' --output text)

MYIP=$(curl -s https://checkip.amazonaws.com)
aws ec2 authorize-security-group-ingress --group-id $EC2_SG --protocol tcp --port 22  --cidr ${MYIP}/32
aws ec2 authorize-security-group-ingress --group-id $EC2_SG --protocol tcp --port 80  --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $EC2_SG --protocol tcp --port 443 --cidr 0.0.0.0/0

# DB SG — only the EC2 SG may reach Postgres
aws ec2 create-security-group --group-name edutrack-db-sg \
  --description "ArkenEdu RDS" --vpc-id $VPC_ID
export DB_SG=$(aws ec2 describe-security-groups --filters Name=group-name,Values=edutrack-db-sg \
  --query 'SecurityGroups[0].GroupId' --output text)
aws ec2 authorize-security-group-ingress --group-id $DB_SG \
  --protocol tcp --port 5432 --source-group $EC2_SG
```

> **Never** open 5432 or 22 to `0.0.0.0/0`. RDS gets scraped within hours; SSH
> from anywhere invites brute-force.

---

## 4. RDS — PostgreSQL

Console → **RDS** → **Create database** → **Standard create**.

| Setting | Value |
|---------|-------|
| Engine | PostgreSQL 15.x |
| Templates | **Production** (or **Free tier** for the first year) |
| DB identifier | `edutrack-db` |
| Master username | `edutrack_admin` |
| Master password | Generate 32 chars (use only `[A-Za-z0-9_-]` to avoid URL-encoding); save to a password manager **now** |
| Instance class | `db.t4g.micro` (bump to `db.t4g.small` past ~100 concurrent users) |
| Storage | gp3, 20 GiB, **enable storage autoscaling** (max 100 GiB) |
| Multi-AZ | Optional — Yes for ~60s failover (doubles DB cost) |
| VPC | default (same VPC as the EC2 box) |
| Public access | **No** |
| VPC security group | `edutrack-db-sg` |
| Initial DB name | `edutrack` |
| Backup retention | 7 days (enables PITR) |
| Encryption | Enabled |
| Deletion protection | **Enable** |

Takes 10–15 min. Then build the connection string:

```bash
export DB_HOST=$(aws rds describe-db-instances --db-instance-identifier edutrack-db \
  --query 'DBInstances[0].Endpoint.Address' --output text)

# This goes into backend/.env on the EC2 box (NOT into the repo):
#   DATABASE_URL=postgresql://edutrack_admin:<PASSWORD>@<DB_HOST>:5432/edutrack
```

> The app's async engine strips `?sslmode=` and applies TLS via `connect_args`,
> so a plain `postgresql://…` URL works against RDS — see
> [backend/app/core/database.py](backend/app/core/database.py).

> **⚠ Rotate any DB password that has ever been committed.** An earlier version
> of `docker-compose.yml` contained a hard-coded RDS URL. If that password is
> still in use, change the RDS master password (Console → RDS → Modify) and
> update `backend/.env` on the box. The credential remains in git history.

---

## 5. S3 — uploads bucket

```bash
export BUCKET=edutrack-uploads-$AWS_ACCOUNT_ID

aws s3api create-bucket --bucket "$BUCKET" --region "$AWS_REGION" \
  --create-bucket-configuration LocationConstraint="$AWS_REGION"

# Block all public access (presigned URLs still work)
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# Abort stale multipart uploads after 7 days (saves $)
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" \
  --lifecycle-configuration '{"Rules":[{"ID":"AbortIncompleteMPU","Status":"Enabled",
    "Filter":{},"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":7}}]}'

# CORS — the web SPA uploads directly via presigned PUT
aws s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration '{
  "CORSRules":[{
    "AllowedOrigins":["https://www.arkenedu.com"],
    "AllowedMethods":["GET","PUT","POST"],
    "AllowedHeaders":["*"],
    "ExposeHeaders":["ETag"],
    "MaxAgeSeconds":3000
  }]
}'
```

Create an IAM user (or instance-profile role) with access to just this bucket
and put its keys in `backend/.env` as `AWS_ACCESS_KEY_ID` /
`AWS_SECRET_ACCESS_KEY` (plus `AWS_S3_BUCKET`, `AWS_S3_REGION`). The cleanest
option is an **EC2 instance role** with an S3 policy scoped to the bucket — then
you can omit the static keys and boto3 uses the role automatically.

---

## 6. EC2 — launch the box

Launch an instance (Console → EC2 → Launch instance):

| Setting | Value |
|---------|-------|
| AMI | Ubuntu Server 24.04 LTS (x86_64) |
| Instance type | `t3.small` |
| Key pair | create/select one — you'll SSH with it |
| Network | default VPC, **auto-assign public IP = Enable** |
| Security group | `edutrack-ec2-sg` |
| Storage | 30 GiB gp3 |

Allocate and associate an **Elastic IP** so the address survives stop/start:

```bash
aws ec2 allocate-address --domain vpc
# associate it to the instance in the console (EC2 → Elastic IPs → Associate)
```

SSH in and install Docker + Compose plugin + nginx + certbot:

```bash
ssh -i your-key.pem ubuntu@<ELASTIC_IP>

sudo apt-get update && sudo apt-get upgrade -y

# Docker Engine + Compose plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu     # log out/in so `docker` works without sudo

# nginx + certbot for TLS
sudo apt-get install -y nginx
sudo snap install --classic certbot
sudo ln -sf /snap/bin/certbot /usr/bin/certbot
```

---

## 7. Clone the repo + configure secrets

```bash
cd /home/ubuntu
git clone https://github.com/<your-org>/SCHOOL.git
cd SCHOOL

cp backend/.env.example backend/.env
nano backend/.env
```

Set at minimum (see the full table in §16):

```ini
ENVIRONMENT=prod
DATABASE_URL=postgresql://edutrack_admin:<PASSWORD>@<DB_HOST>:5432/edutrack
SECRET_KEY=<python -c 'import secrets; print(secrets.token_urlsafe(48))'>
FRONTEND_URL=https://www.arkenedu.com
COOKIE_DOMAIN=.arkenedu.com
COOKIE_SAMESITE=lax            # www + api are same-site subdomains
AWS_S3_BUCKET=edutrack-uploads-<ACCOUNT_ID>
AWS_S3_REGION=ap-south-1
AWS_ACCESS_KEY_ID=...          # omit if using an EC2 instance role
AWS_SECRET_ACCESS_KEY=...
# REDIS_URL is set by docker-compose.prod.yml to the redis container; only
# override here if you point at ElastiCache.
```

> `backend/.env` is gitignored — it lives only on the box and is never pushed.

---

## 8. Bring up the stack

```bash
cd /home/ubuntu/SCHOOL

# Build images
docker compose -f docker-compose.prod.yml build

# Apply DB migrations (one-off, against RDS)
docker compose -f docker-compose.prod.yml run --rm backend alembic upgrade head

# (first deploy only) seed the superadmin. Demo data is skipped when
# ENVIRONMENT=prod unless SEED_DEMO_DATA=true.
docker compose -f docker-compose.prod.yml run --rm backend python seed.py

# Start backend + worker + redis
docker compose -f docker-compose.prod.yml up -d

# Verify the API is up on loopback
curl -s http://127.0.0.1:8000/health      # → {"status":"ok",...}
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend
```

The API binds to `127.0.0.1:8000` only — it is not reachable from the internet
until nginx proxies it (next step).

---

## 9. nginx reverse proxy + TLS

Create `/etc/nginx/sites-available/arkenedu` on the box:

```nginx
# --- API: api.arkenedu.com → backend container on 127.0.0.1:8000 ---
server {
    listen 80;
    server_name api.arkenedu.com;

    # AI generation endpoints are long-running (Lesson Plan can take minutes).
    # Give them generous read timeouts so nginx doesn't 504 before the backend
    # responds. Every other path keeps the tighter default below.
    location ~ ^/api/(lesson-plan/generate|question-bank/generate-s3)$ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 30s;
        proxy_send_timeout    300s;
        proxy_read_timeout    300s;
    }

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 30s;
        proxy_send_timeout    75s;
        proxy_read_timeout    75s;

        # WebSocket support (transport tracking)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    client_max_body_size 25m;   # match the app's upload ceiling
}

# --- Web SPA: www.arkenedu.com → static Vite build ---
server {
    listen 80;
    server_name www.arkenedu.com arkenedu.com;

    root /home/ubuntu/SCHOOL/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;   # SPA history fallback
    }
}
```

> `deployment/nginx/nginx.conf` in the repo is the same proxy logic written for
> a multi-replica/load-balanced layout (ports 8001–8003). The single-box config
> above is what you actually install at `/etc/nginx/sites-available/`.

Enable it and obtain certs:

```bash
sudo ln -s /etc/nginx/sites-available/arkenedu /etc/nginx/sites-enabled/arkenedu
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# certbot edits the server blocks to add 443 + HTTP→HTTPS redirect, then
# auto-renews via a systemd timer.
sudo certbot --nginx -d api.arkenedu.com -d www.arkenedu.com -d arkenedu.com
```

---

## 10. DNS

Point the records at the Elastic IP (Route 53, or your registrar's DNS):

```
api.arkenedu.com   A   →   <ELASTIC_IP>
www.arkenedu.com   A   →   <ELASTIC_IP>
arkenedu.com       A   →   <ELASTIC_IP>
```

Wait for propagation, then certbot (§9) can validate. Confirm:

```bash
curl -s https://api.arkenedu.com/health        # → {"status":"ok","environment":"prod"}
```

---

## 11. Frontend (web SPA)

The SPA is a static Vite build. Build it on the box (or in CI and copy `dist/`):

```bash
cd /home/ubuntu/SCHOOL/frontend
cp .env .env.local 2>/dev/null || true
# Ensure the prod API base is set before building:
#   VITE_API_BASE_URL=https://api.arkenedu.com/api
npm ci
npm run build           # outputs frontend/dist (served by nginx, §9)
```

Rebuild + `dist/` refresh on every frontend change. (If you'd rather keep the
SPA on a static host/CDN like Vercel or CloudFront+S3, drop the `www` server
block from nginx and point the `www` DNS record there instead — the backend is
unaffected as long as `FRONTEND_URL` / CORS match.)

---

## 12. Redis — local container vs ElastiCache

The default `docker-compose.prod.yml` runs Redis as a sibling container, which
is fine for a single box. To use **ElastiCache** instead (managed, survives an
instance rebuild):

1. Create a `cache.t4g.micro` Redis (cluster mode disabled) in the same VPC,
   SG allowing 6379 from `edutrack-ec2-sg`.
2. Set `REDIS_URL=rediss://default:<AUTH-TOKEN>@<endpoint>:6379/0` in
   `backend/.env` (the `rediss://` scheme enables TLS).
3. Remove the `redis` service + `depends_on` from `docker-compose.prod.yml`.

---

## 13. CI/CD — automated deploy on push to main

[`.github/workflows/deploy-prod.yml`](.github/workflows/deploy-prod.yml) runs a
security scan, then SSHes into the box, pulls `main`, rebuilds, runs
`alembic upgrade head`, and `docker compose up -d`, then health-checks the
public URL.

Add these **GitHub Actions secrets** (repo → Settings → Secrets → Actions):

| Secret | Value |
|--------|-------|
| `EC2_SSH_HOST` | Elastic IP or `api.arkenedu.com` |
| `EC2_SSH_USER` | `ubuntu` |
| `EC2_SSH_KEY` | the **private** key (PEM) authorized on the box |
| `EC2_APP_DIR` | (optional) repo path; defaults to `/home/ubuntu/SCHOOL` |
| `BACKEND_BASE_URL` | (optional) defaults to `https://api.arkenedu.com` |

To deploy by hand instead, the four commands are:

```bash
cd /home/ubuntu/SCHOOL
git pull --ff-only origin main
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm backend alembic upgrade head
docker compose -f docker-compose.prod.yml up -d
```

> **Scaling beyond one box (later):** bake the image in ECR, put an ALB in front
> with a `/health` target group, and run the stack on 2+ instances behind an
> Auto Scaling Group. Keep the **worker at exactly one replica** regardless —
> the fee-reminder scheduler uses per-process cron locks and two workers would
> double-dispatch.

---

## 14. The fee-reminder scheduler

The `worker` container owns the in-process scheduler
(`FEE_REMINDER_SCHEDULER_ENABLED=true`); the `backend` (web) service keeps it
off. It only fires for institutions whose admin opted into WEEKLY/MONTHLY
reminders — admin click-to-send is the primary flow.

If you ever run more than one box, run the worker on exactly one of them. To
trigger a dispatch manually (e.g. from a systemd timer or external cron):

```bash
curl -X POST -H "X-Cron-Secret: $CRON_SECRET" \
  https://api.arkenedu.com/api/finance/fee-reminders/dispatch
```

---

## 15. Observability

- **Logs**: `docker compose -f docker-compose.prod.yml logs -f backend`.
  Prod logs are structured JSON (`LOG_JSON=true` auto-on when `ENVIRONMENT=prod`);
  every line carries `request_id`. Ship to CloudWatch with the CloudWatch agent
  if you want central retention/alarms.
- **Sentry**: set `SENTRY_DSN` in `backend/.env` → errors + releases tracked
  automatically (the SDK is imported lazily, so it's a no-op when unset).
- **RDS / EC2 metrics**: CloudWatch already collects CPU, connections, freeable
  memory, disk. Add alarms on RDS CPU > 80% and EC2 StatusCheckFailed.

---

## 16. Reference — production env vars (`backend/.env` on the box)

| Variable | Required | Notes |
|----------|----------|-------|
| `ENVIRONMENT` | ✅ | `prod` — enables HSTS, secure cookies, strict S3 check |
| `DATABASE_URL` | ✅ | RDS: `postgresql://user:pass@<rds-endpoint>:5432/edutrack` |
| `SECRET_KEY` | ✅ | 32+ chars, `secrets.token_urlsafe(48)` |
| `FRONTEND_URL` | ✅ | `https://www.arkenedu.com` (CORS + email links) |
| `ADDITIONAL_CORS_ORIGINS` |   | extra browser origins, comma-sep (see below) |
| `COOKIE_DOMAIN` | ✅ | `.arkenedu.com` (leading dot) |
| `COOKIE_SAMESITE` | ✅ | `lax` (www + api are same-site subdomains) |
| `AWS_S3_BUCKET` + `AWS_S3_REGION` | ✅ | startup hard-fails without these in prod |
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` |   | omit when using an EC2 instance role |
| `REDIS_URL` |   | set by compose to the redis container; override for ElastiCache |
| `CRON_SECRET` |   | for an external cron hitting the dispatch endpoint |
| `GOOGLE_API_KEY` / `OPENAI_API_KEY` |   | AI lesson plan / question bank |
| `TWILIO_*` |   | outbound voice calls; silent no-op when unset |
| `EXPO_ACCESS_TOKEN` |   | only with Enhanced Push Security |
| `SENTRY_DSN` |   | error tracking |

### Testing the mobile app in a browser (Expo Web) against this backend

Native iOS/Android builds are **not** subject to CORS, so `api.arkenedu.com`
works on a real device with no server change. But the **Expo *web* preview**
(`http://localhost:8081` / `:19006` in a browser) is a cross-origin caller, and
a `prod` backend rejects localhost origins by default ("Disallowed CORS
origin"). To allow it, add those origins on the box and restart:

```bash
# in backend/.env on the EC2 box:
ADDITIONAL_CORS_ORIGINS=http://localhost:8081,http://localhost:19006

docker compose -f docker-compose.prod.yml up -d backend   # recreate to pick up env
```

Verify the preflight now passes:

```bash
curl -i -X OPTIONS https://api.arkenedu.com/api/directory/parents/login \
  -H "Origin: http://localhost:8081" \
  -H "Access-Control-Request-Method: POST"
# → 200 with an `access-control-allow-origin: http://localhost:8081` header
```

---

## 17. Post-deploy checklist

- [ ] `https://api.arkenedu.com/health` → 200 `{"status":"ok","environment":"prod"}`
- [ ] Web SPA at `https://www.arkenedu.com` loads and can log in
- [ ] Mobile app (real device) logs in; push tokens register
- [ ] Upload a file → lands in S3, opens via presigned URL
- [ ] Parent UPI flow end-to-end: submit UTR → admin verifies → ledger updates
- [ ] `docker compose -f docker-compose.prod.yml logs backend` shows JSON, no idle ERRORs
- [ ] RDS automated backups enabled; deletion protection on
- [ ] certbot renewal timer active: `sudo systemctl list-timers | grep certbot`
- [ ] Any previously committed DB password rotated (see §4)

---

## 18. Common pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| `502 Bad Gateway` from nginx | backend container down or not on 8000 | `docker compose -f docker-compose.prod.yml ps`; check logs |
| API `/health` 200 on box but site won't load | DNS not pointing at the Elastic IP, or certbot not run | verify A records; re-run `certbot --nginx` |
| `connection refused` to RDS | EC2 SG not allowed on the DB SG | `edutrack-db-sg` must allow 5432 *from* `edutrack-ec2-sg` |
| Startup aborts: "AWS S3 is not configured" | missing S3 env in prod | set `AWS_S3_BUCKET` + `AWS_S3_REGION` (+ keys or instance role) |
| "logged in then 401" on web | wrong cookie policy across www/api | `COOKIE_SAMESITE=lax`, `COOKIE_DOMAIN=.arkenedu.com` |
| Expo **web** preview blocked by CORS | localhost origin not allowed on prod | add to `ADDITIONAL_CORS_ORIGINS` (see §16) — native apps are unaffected |
| Lesson Plan 504 | nginx default 60s read timeout | the AI `location` block raises it to 300s (§9) |
| Fee reminders sent twice | more than one worker container | keep `worker` at one replica |
| Disk fills up over time | old Docker image layers | the deploy runs `docker image prune -f`; add a cron `docker system prune -f` |

---

**Done.** First-time provisioning (RDS + EC2 + nginx + certbot) takes ~1–2 hours.
After that, deploys are the four commands in §13 — or just push to `main`.
