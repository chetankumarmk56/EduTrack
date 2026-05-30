# EduTrack — AWS Deployment Guide

End-to-end guide to move the backend off **Render** and the database off **Neon** to **AWS**, with **auto-scaling**, **load balancing**, **managed Redis**, and **production-grade observability**. The Vercel frontend stays as-is — only its `VITE_API_BASE_URL` will change to point at the new ALB / domain.

> **Audience**: someone with an AWS account, billing enabled, and the AWS CLI installed. No prior ECS experience required — every step has the exact command or console action.

---

## 0. Target Architecture

```
                ┌────────────────────────────────────────────────┐
                │  Vercel (frontend, unchanged)                  │
                │  https://your-app.vercel.app                   │
                └─────────────────────┬──────────────────────────┘
                                      │  HTTPS
                                      ▼
                         ┌────────────────────────┐
                         │  Route 53 (DNS)        │
                         │  api.yourdomain.com    │
                         └───────────┬────────────┘
                                     ▼
                         ┌────────────────────────┐
                         │  ACM Cert (TLS)        │
                         └───────────┬────────────┘
                                     ▼
                  ┌──────────────────────────────────────┐
                  │  Application Load Balancer (ALB)     │
                  │  — health checks /health             │
                  │  — sticky sessions OFF (stateless)   │
                  └──────────────────┬───────────────────┘
                                     ▼
       ┌─────────────────────────────────────────────────────────┐
       │            ECS Fargate Cluster   (Private Subnets)      │
       │                                                         │
       │  ┌──────────────────────────┐  ┌────────────────────┐   │
       │  │ Service: edutrack-web    │  │ Service:           │   │
       │  │ (FastAPI / gunicorn)     │  │  edutrack-worker   │   │
       │  │ Min 2, Max 20 tasks      │  │ Exactly 1 task     │   │
       │  │ Auto-scales on CPU+req   │  │ (cron locks)       │   │
       │  └──────────────┬───────────┘  └─────────┬──────────┘   │
       └─────────────────┼─────────────────────────┼──────────────┘
                         │                         │
              ┌──────────▼─────────┐    ┌──────────▼─────────┐
              │  ElastiCache       │    │  RDS PostgreSQL    │
              │  Redis 7 (cluster) │    │  Multi-AZ + read   │
              │  for rate-limit +  │    │  replica + auto    │
              │  pub/sub           │    │  storage scaling   │
              └────────────────────┘    └────────────────────┘

              ┌────────────────────┐    ┌────────────────────┐
              │  S3 (uploads)      │    │  Secrets Manager   │
              │  AWS_S3_BUCKET     │    │  DB / Redis / keys │
              └────────────────────┘    └────────────────────┘

              ┌────────────────────┐    ┌────────────────────┐
              │  ECR (Docker imgs) │    │  CloudWatch Logs   │
              └────────────────────┘    └────────────────────┘

              ┌────────────────────────────────────────────┐
              │  EventBridge Scheduler                     │
              │  Wed 03:30 UTC → invoke fee-reminder URL   │
              └────────────────────────────────────────────┘
```

### Why ECS Fargate (not EC2, not Lambda, not EKS)

| Option | Verdict |
|--------|---------|
| **Fargate** ✅ | No server patching, sub-minute auto-scaling, charged per second, perfect for a Gunicorn FastAPI app. |
| EC2 ASG | Cheaper at very high scale but you own AMI patching. Not worth it for a school SaaS. |
| Lambda | Cold starts (~1–3s) ruin login UX; persistent Redis pub/sub won't survive. |
| EKS | Overkill — adds a control-plane bill ($73/mo) and a steep learning curve. |

### Why managed RDS + ElastiCache (not self-hosted)

You already pay Neon to manage Postgres; RDS does the same with Multi-AZ failover, automated backups (PITR), and storage auto-scaling. ElastiCache replaces "Render Redis / Upstash" — required for multi-replica rate-limiting and websocket pub/sub (see [backend/gunicorn_conf.py](backend/gunicorn_conf.py)).

---

## 1. Costs (us-east-1, 2026 pricing — verify before you commit)

| Service | Size | Monthly |
|---------|------|---------|
| ECS Fargate web (2 × 0.5 vCPU, 1 GB) | baseline | ~$25 |
| ECS Fargate worker (1 × 0.25 vCPU, 0.5 GB) | always-on | ~$6 |
| ALB | 1 instance | ~$18 + traffic |
| RDS Postgres `db.t4g.micro` Multi-AZ | 20 GB gp3 | ~$30 |
| ElastiCache Redis `cache.t4g.micro` | single node | ~$12 |
| S3 + CloudWatch + data transfer | low | ~$5 |
| **Baseline total** |   | **~$95–110 /mo** |

Scaling to 8 web tasks during peak hours adds ~$30/mo. Add ~$15/mo to make Redis Multi-AZ.

> **Free Tier**: brand-new AWS accounts get 12 months of `db.t4g.micro` + 750 hr/mo Fargate-free is **not** a thing — Fargate is not free-tier eligible. Budget at least $50 even if everything else is free.

---

## 2. Prerequisites

```bash
# 1. AWS CLI v2 — verify
aws --version  # aws-cli/2.x...

# 2. Configure credentials (use an IAM user with AdministratorAccess for setup;
#    create a least-privilege role afterward).
aws configure
#   AWS Access Key ID:     <paste>
#   AWS Secret Access Key: <paste>
#   Default region:        us-east-1   (or ap-south-1 for India)
#   Default output:        json

# 3. Docker (needed to build & push the backend image)
docker --version

# 4. (Optional but recommended) Terraform or AWS Copilot.
#    This guide uses raw CLI + console so you understand each piece.
```

Pick a region close to your users. For an India-first product (UPI / INR, Asia/Kolkata schedulers), use **`ap-south-1` (Mumbai)**. The commands below use `us-east-1` — replace as needed.

```bash
export AWS_REGION=ap-south-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "Using account $AWS_ACCOUNT_ID in $AWS_REGION"
```

---

## 3. Networking — VPC with public + private subnets

You need a VPC where the ALB sits in **public** subnets and the Fargate tasks / RDS / Redis sit in **private** subnets. The default VPC is fine for a quick start but uses public subnets only — for production, create a dedicated VPC.

**Fastest path** — use the VPC console wizard:

1. Console → **VPC** → **Create VPC** → choose **"VPC and more"**.
2. Name tag: `edutrack-vpc`.
3. IPv4 CIDR: `10.0.0.0/16`.
4. Availability Zones: **2** (required for RDS Multi-AZ + ALB).
5. Public subnets: **2**. Private subnets: **2**.
6. NAT gateways: **In 1 AZ** (saves ~$32/mo vs one-per-AZ; acceptable for a small SaaS).
7. VPC endpoints: **None** (you can add an S3 gateway endpoint later for free egress).
8. Click **Create VPC**. Takes ~2 min.

Note the IDs from the resource map — you'll need them:
```bash
export VPC_ID=vpc-xxxxxxxx
export PUBLIC_SUBNET_A=subnet-xxxxxxxx
export PUBLIC_SUBNET_B=subnet-xxxxxxxx
export PRIVATE_SUBNET_A=subnet-xxxxxxxx
export PRIVATE_SUBNET_B=subnet-xxxxxxxx
```

### Security Groups

Create four SGs (Console → VPC → Security Groups):

| SG name | Inbound | Purpose |
|---------|---------|---------|
| `edutrack-alb-sg` | 80, 443 from `0.0.0.0/0` | Public HTTPS terminator |
| `edutrack-app-sg` | 8000 from `edutrack-alb-sg` only | Fargate tasks |
| `edutrack-db-sg` | 5432 from `edutrack-app-sg` only | RDS Postgres |
| `edutrack-redis-sg` | 6379 from `edutrack-app-sg` only | ElastiCache |

> **Rule of thumb**: never expose RDS or Redis to `0.0.0.0/0`. Even with a strong password, you'll get scraped within hours.

---

## 4. RDS — PostgreSQL (replaces Neon)

Console → **RDS** → **Create database** → **Standard create**.

| Setting | Value |
|---------|-------|
| Engine | PostgreSQL 15.x |
| Templates | **Production** (gets you Multi-AZ + monitoring defaults) |
| DB identifier | `edutrack-db` |
| Master username | `edutrack_admin` |
| Master password | Generate 32 chars; save to a password manager *now* |
| Instance class | `db.t4g.micro` (burstable, ARM) — bump to `db.t4g.small` if you cross 100 concurrent users |
| Storage | gp3, 20 GiB, **enable storage autoscaling** with max 100 GiB |
| Multi-AZ | **Yes** (failover in ~60s; doubles cost but is the whole point of leaving Neon free) |
| VPC | `edutrack-vpc` |
| Subnet group | Auto-create using the **private** subnets |
| Public access | **No** |
| VPC SG | `edutrack-db-sg` |
| Initial DB name | `edutrack` |
| Backup retention | 7 days |
| Encryption | Enabled (default KMS key) |
| Deletion protection | **Enable** |

Click **Create database**. Takes 10–15 min.

### Build the DATABASE_URL

```bash
# After RDS is "Available", grab the endpoint:
export DB_HOST=$(aws rds describe-db-instances --db-instance-identifier edutrack-db \
  --query 'DBInstances[0].Endpoint.Address' --output text)

export DATABASE_URL="postgresql://edutrack_admin:<URL-ENCODED-PASSWORD>@$DB_HOST:5432/edutrack"
```

> **URL-encode the password** if it contains `@`, `:`, `/`, `#`, `?`, or `%` — these break the connection string. Easiest: generate a password that uses only `[A-Za-z0-9_-]`.

### Migrate data from Neon → RDS

```bash
# 1. From your laptop, dump Neon:
pg_dump "$NEON_DATABASE_URL" \
  --no-owner --no-acl --format=custom --file=neon-dump.bin

# 2. Restore into RDS. Run this from an EC2 jump box in the same VPC (or
#    temporarily allow 5432 from your IP on edutrack-db-sg — REMOVE AFTER).
pg_restore --dbname="$DATABASE_URL" --no-owner --no-acl --clean --if-exists neon-dump.bin

# 3. Verify row counts match the Neon side.
psql "$DATABASE_URL" -c "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname;"
```

> **DO NOT decommission Neon until** at least 48 h after AWS is serving 100% of prod traffic with no errors.

---

## 5. ElastiCache — Redis (replaces Render/Upstash Redis)

Console → **ElastiCache** → **Redis OSS caches** → **Create**.

| Setting | Value |
|---------|-------|
| Deployment | **Design your own cache** → Cluster mode **disabled** (the app uses a single Redis URL) |
| Engine version | Redis 7.x |
| Name | `edutrack-redis` |
| Node type | `cache.t4g.micro` |
| Replicas | 1 (for failover) — set to 0 if budget is tight |
| Multi-AZ | Enabled (only with ≥1 replica) |
| Subnet group | New, using **private** subnets |
| Security group | `edutrack-redis-sg` |
| Encryption in transit | Enabled |
| Encryption at rest | Enabled |
| AUTH token | Generate a strong token, save it |

Click **Create**. Takes ~10 min.

After it's available:

```bash
export REDIS_HOST=$(aws elasticache describe-replication-groups \
  --replication-group-id edutrack-redis \
  --query 'ReplicationGroups[0].NodeGroups[0].PrimaryEndpoint.Address' --output text)

# With encryption-in-transit + AUTH:
export REDIS_URL="rediss://default:<AUTH-TOKEN>@$REDIS_HOST:6379/0"
```

> The `rediss://` (two s's) scheme tells the Python `redis` client to use TLS. The app code already supports this — see [backend/app/core/config.py](backend/app/core/config.py).

---

## 6. S3 — File uploads bucket

```bash
export BUCKET=edutrack-uploads-$AWS_ACCOUNT_ID

aws s3api create-bucket --bucket "$BUCKET" \
  --region "$AWS_REGION" \
  --create-bucket-configuration LocationConstraint="$AWS_REGION"

# Block all public access (presigned URLs still work)
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# Lifecycle: delete incomplete multipart uploads after 7 days (save $)
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" \
  --lifecycle-configuration '{
    "Rules":[{"ID":"AbortIncompleteMPU","Status":"Enabled","Filter":{},
              "AbortIncompleteMultipartUpload":{"DaysAfterInitiation":7}}]}'

# CORS — Vercel frontend uploads directly via presigned PUT
aws s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration '{
  "CORSRules":[{
    "AllowedOrigins":["https://your-app.vercel.app"],
    "AllowedMethods":["GET","PUT","POST"],
    "AllowedHeaders":["*"],
    "ExposeHeaders":["ETag"],
    "MaxAgeSeconds":3000
  }]
}'
```

---

## 7. Secrets Manager — store every secret

Never bake secrets into the Docker image or task definition's `environment` block. Use Secrets Manager and reference them in the task definition (encrypted, rotatable, audit-logged).

```bash
# One secret per value (cleaner IAM scoping):
aws secretsmanager create-secret --name edutrack/DATABASE_URL --secret-string "$DATABASE_URL"
aws secretsmanager create-secret --name edutrack/REDIS_URL    --secret-string "$REDIS_URL"
aws secretsmanager create-secret --name edutrack/SECRET_KEY   --secret-string "$(python3 -c 'import secrets;print(secrets.token_urlsafe(48))')"
aws secretsmanager create-secret --name edutrack/GOOGLE_API_KEY --secret-string "xxx"
aws secretsmanager create-secret --name edutrack/TWILIO_ACCOUNT_SID --secret-string "ACxxx"
aws secretsmanager create-secret --name edutrack/TWILIO_AUTH_TOKEN --secret-string "xxx"
aws secretsmanager create-secret --name edutrack/TWILIO_FROM_NUMBER --secret-string "+91xxx"
aws secretsmanager create-secret --name edutrack/CRON_SECRET --secret-string "$(python3 -c 'import secrets;print(secrets.token_urlsafe(32))')"
aws secretsmanager create-secret --name edutrack/EXPO_ACCESS_TOKEN --secret-string "xxx"
```

Grab their ARNs:
```bash
aws secretsmanager list-secrets --query 'SecretList[?starts_with(Name, `edutrack/`)].[Name,ARN]' --output table
```

---

## 8. ECR — push the Docker image

```bash
# 8.1. Create repo
aws ecr create-repository --repository-name edutrack-backend \
  --image-scanning-configuration scanOnPush=true

export ECR_URI=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/edutrack-backend

# 8.2. Authenticate Docker against ECR
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin \
    $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# 8.3. Build (use linux/amd64 — Fargate is x86_64 by default; for ARM Fargate
#       use --platform=linux/arm64 and set the task CPU architecture to ARM64)
cd backend
docker build --platform=linux/amd64 -t edutrack-backend:v1 .

# 8.4. Tag & push
docker tag edutrack-backend:v1 $ECR_URI:v1
docker tag edutrack-backend:v1 $ECR_URI:latest
docker push $ECR_URI:v1
docker push $ECR_URI:latest
```

---

## 9. IAM roles for ECS

You need **two** roles per Fargate task:

| Role | What it does |
|------|--------------|
| **Task execution role** | Lets ECS pull the image from ECR, fetch secrets from Secrets Manager, write logs to CloudWatch. |
| **Task role** | What the *running app* can do (S3 access, Bedrock if you use it, etc.). |

### 9.1. Task execution role
```bash
cat > /tmp/ecs-trust.json <<'EOF'
{ "Version":"2012-10-17","Statement":[{
  "Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},
  "Action":"sts:AssumeRole" }]}
EOF

aws iam create-role --role-name edutrack-ecs-exec --assume-role-policy-document file:///tmp/ecs-trust.json
aws iam attach-role-policy --role-name edutrack-ecs-exec \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Allow it to read the Secrets Manager entries we created
cat > /tmp/secrets-read.json <<EOF
{ "Version":"2012-10-17","Statement":[{
  "Effect":"Allow",
  "Action":["secretsmanager:GetSecretValue"],
  "Resource":"arn:aws:secretsmanager:$AWS_REGION:$AWS_ACCOUNT_ID:secret:edutrack/*" }]}
EOF
aws iam put-role-policy --role-name edutrack-ecs-exec \
  --policy-name edutrack-secrets-read --policy-document file:///tmp/secrets-read.json
```

### 9.2. Task role (app permissions)
```bash
aws iam create-role --role-name edutrack-app --assume-role-policy-document file:///tmp/ecs-trust.json

cat > /tmp/app-perms.json <<EOF
{ "Version":"2012-10-17","Statement":[
  { "Effect":"Allow",
    "Action":["s3:GetObject","s3:PutObject","s3:DeleteObject","s3:ListBucket"],
    "Resource":[
      "arn:aws:s3:::$BUCKET",
      "arn:aws:s3:::$BUCKET/*" ]}
]}
EOF
aws iam put-role-policy --role-name edutrack-app \
  --policy-name edutrack-app-perms --policy-document file:///tmp/app-perms.json
```

> With the task role granting S3 access, you can **remove** `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` from the env — boto3 will use the task role automatically. Cleaner & more secure than static keys.

---

## 10. CloudWatch log group

```bash
aws logs create-log-group --log-group-name /ecs/edutrack
aws logs put-retention-policy --log-group-name /ecs/edutrack --retention-in-days 30
```

---

## 11. ECS Cluster + Task Definitions

```bash
# 11.1. Cluster
aws ecs create-cluster --cluster-name edutrack \
  --capacity-providers FARGATE FARGATE_SPOT \
  --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1
```

### 11.2. Web task definition

Save as `/tmp/edutrack-web-taskdef.json` (replace ARNs as needed):

```json
{
  "family": "edutrack-web",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/edutrack-ecs-exec",
  "taskRoleArn":      "arn:aws:iam::ACCOUNT:role/edutrack-app",
  "containerDefinitions": [{
    "name": "web",
    "image": "ACCOUNT.dkr.ecr.REGION.amazonaws.com/edutrack-backend:latest",
    "essential": true,
    "portMappings": [{"containerPort": 8000, "protocol": "tcp"}],
    "command": ["sh","-c","alembic upgrade head && gunicorn -c gunicorn_conf.py app.main:app"],
    "environment": [
      {"name":"ENVIRONMENT","value":"prod"},
      {"name":"PORT","value":"8000"},
      {"name":"WEB_CONCURRENCY","value":"4"},
      {"name":"FEE_REMINDER_SCHEDULER_ENABLED","value":"false"},
      {"name":"FRONTEND_URL","value":"https://your-app.vercel.app"},
      {"name":"ADDITIONAL_CORS_ORIGINS","value":""},
      {"name":"COOKIE_SECURE","value":"true"},
      {"name":"COOKIE_DOMAIN",".yourdomain.com"},
      {"name":"AWS_S3_BUCKET","value":"edutrack-uploads-ACCOUNT"},
      {"name":"AWS_S3_REGION","value":"REGION"},
      {"name":"LOG_JSON","value":"true"}
    ],
    "secrets": [
      {"name":"DATABASE_URL",            "valueFrom":"arn:aws:secretsmanager:REGION:ACCOUNT:secret:edutrack/DATABASE_URL"},
      {"name":"REDIS_URL",               "valueFrom":"arn:aws:secretsmanager:REGION:ACCOUNT:secret:edutrack/REDIS_URL"},
      {"name":"SECRET_KEY",              "valueFrom":"arn:aws:secretsmanager:REGION:ACCOUNT:secret:edutrack/SECRET_KEY"},
      {"name":"GOOGLE_API_KEY",          "valueFrom":"arn:aws:secretsmanager:REGION:ACCOUNT:secret:edutrack/GOOGLE_API_KEY"},
      {"name":"TWILIO_ACCOUNT_SID",      "valueFrom":"arn:aws:secretsmanager:REGION:ACCOUNT:secret:edutrack/TWILIO_ACCOUNT_SID"},
      {"name":"TWILIO_AUTH_TOKEN",       "valueFrom":"arn:aws:secretsmanager:REGION:ACCOUNT:secret:edutrack/TWILIO_AUTH_TOKEN"},
      {"name":"TWILIO_FROM_NUMBER",      "valueFrom":"arn:aws:secretsmanager:REGION:ACCOUNT:secret:edutrack/TWILIO_FROM_NUMBER"},
      {"name":"CRON_SECRET",             "valueFrom":"arn:aws:secretsmanager:REGION:ACCOUNT:secret:edutrack/CRON_SECRET"},
      {"name":"EXPO_ACCESS_TOKEN",       "valueFrom":"arn:aws:secretsmanager:REGION:ACCOUNT:secret:edutrack/EXPO_ACCESS_TOKEN"}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/edutrack",
        "awslogs-region": "REGION",
        "awslogs-stream-prefix": "web"
      }
    },
    "healthCheck": {
      "command": ["CMD-SHELL","curl -f http://localhost:8000/health || exit 1"],
      "interval": 15, "timeout": 5, "retries": 3, "startPeriod": 30
    }
  }]
}
```

```bash
# Replace placeholders before registering
sed -i.bak "s/ACCOUNT/$AWS_ACCOUNT_ID/g; s/REGION/$AWS_REGION/g" /tmp/edutrack-web-taskdef.json
aws ecs register-task-definition --cli-input-json file:///tmp/edutrack-web-taskdef.json
```

### 11.3. Worker task definition

Same as the web definition with these differences:
- `"family": "edutrack-worker"`
- `"cpu":"256"`, `"memory":"512"`
- `"portMappings"`: **omit**
- `"command": ["python","worker.py"]`
- `"healthCheck"`: **omit** (no HTTP server)
- Env: set `FEE_REMINDER_SCHEDULER_ENABLED=true`
- `"awslogs-stream-prefix": "worker"`

---

## 12. Application Load Balancer + Target Group

```bash
# 12.1. ACM cert for api.yourdomain.com — must be in the same region as the ALB.
#       (Console → ACM → Request → DNS validation; takes ~5 min after you
#        add the CNAME to Route 53.)
export CERT_ARN=arn:aws:acm:$AWS_REGION:$AWS_ACCOUNT_ID:certificate/xxxxx

# 12.2. ALB
aws elbv2 create-load-balancer \
  --name edutrack-alb \
  --type application \
  --scheme internet-facing \
  --security-groups <edutrack-alb-sg-id> \
  --subnets $PUBLIC_SUBNET_A $PUBLIC_SUBNET_B

export ALB_ARN=$(aws elbv2 describe-load-balancers --names edutrack-alb \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)
export ALB_DNS=$(aws elbv2 describe-load-balancers --names edutrack-alb \
  --query 'LoadBalancers[0].DNSName' --output text)

# 12.3. Target group (the web tasks register here)
aws elbv2 create-target-group \
  --name edutrack-web-tg \
  --protocol HTTP --port 8000 \
  --vpc-id $VPC_ID \
  --target-type ip \
  --health-check-path /health \
  --health-check-interval-seconds 15 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --matcher HttpCode=200

export TG_ARN=$(aws elbv2 describe-target-groups --names edutrack-web-tg \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

# 12.4. HTTPS listener (terminates TLS at the ALB)
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTPS --port 443 \
  --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06 \
  --certificates CertificateArn=$CERT_ARN \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN

# 12.5. HTTP → HTTPS redirect
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP --port 80 \
  --default-actions 'Type=redirect,RedirectConfig={Protocol=HTTPS,Port=443,StatusCode=HTTP_301}'
```

---

## 13. ECS Service — web (with auto-scaling)

```bash
aws ecs create-service \
  --cluster edutrack \
  --service-name edutrack-web \
  --task-definition edutrack-web \
  --desired-count 2 \
  --launch-type FARGATE \
  --platform-version LATEST \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNET_A,$PRIVATE_SUBNET_B],securityGroups=[<edutrack-app-sg-id>],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=$TG_ARN,containerName=web,containerPort=8000" \
  --health-check-grace-period-seconds 60 \
  --deployment-configuration "deploymentCircuitBreaker={enable=true,rollback=true},maximumPercent=200,minimumHealthyPercent=100"
```

### Auto-scaling policy

```bash
# Register the service as a scalable target
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/edutrack/edutrack-web \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 --max-capacity 20

# Target-tracking on CPU utilization
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/edutrack/edutrack-web \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu-scale \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue":60.0,
    "PredefinedMetricSpecification":{"PredefinedMetricType":"ECSServiceAverageCPUUtilization"},
    "ScaleOutCooldown":60,
    "ScaleInCooldown":120
  }'

# AND on request count per target (catches spikes before CPU saturates)
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/edutrack/edutrack-web \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name rps-scale \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration "{
    \"TargetValue\":100.0,
    \"PredefinedMetricSpecification\":{
      \"PredefinedMetricType\":\"ALBRequestCountPerTarget\",
      \"ResourceLabel\":\"$(aws elbv2 describe-load-balancers --names edutrack-alb --query 'LoadBalancers[0].LoadBalancerArn' --output text | awk -F'/' '{print $2\"/\"$3\"/\"$4}')/$(aws elbv2 describe-target-groups --names edutrack-web-tg --query 'TargetGroups[0].TargetGroupArn' --output text | awk -F'/' '{print $2\"/\"$3\"/\"$4}')\"
    },
    \"ScaleOutCooldown\":60,
    \"ScaleInCooldown\":120
  }"
```

> Scales out aggressively (60s cooldown) and scales in slowly (120s) — avoids flapping when traffic is bursty.

### Worker service (no scaling)

```bash
aws ecs create-service \
  --cluster edutrack \
  --service-name edutrack-worker \
  --task-definition edutrack-worker \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNET_A,$PRIVATE_SUBNET_B],securityGroups=[<edutrack-app-sg-id>],assignPublicIp=DISABLED}"
```

> **Do not auto-scale the worker.** The fee-reminder scheduler relies on per-process cron locks; two replicas would fight over the same Wednesday dispatch. Render's setup already keeps it at one — same rule here.

---

## 14. DNS — point your domain at the ALB

In Route 53 (or wherever your DNS lives):
```
api.yourdomain.com   ALIAS / CNAME   →   edutrack-alb-xxxxx.elb.amazonaws.com
```

If your domain is in Route 53, use an **A-record alias** (free, faster than CNAME) targeting the ALB.

Update Vercel:
```
VITE_API_BASE_URL=https://api.yourdomain.com
```
Redeploy the frontend.

---

## 15. EventBridge — replace the Render cron

Render's `edutrack-fee-reminder-cron` becomes an EventBridge Scheduler entry:

```bash
# Stash the CRON_SECRET value (you'll inject it in the target's auth header)
CRON_SECRET=$(aws secretsmanager get-secret-value --secret-id edutrack/CRON_SECRET --query SecretString --output text)

aws scheduler create-schedule \
  --name edutrack-fee-reminder \
  --schedule-expression "cron(30 3 ? * WED *)" \
  --schedule-expression-timezone "UTC" \
  --flexible-time-window "Mode=OFF" \
  --target "{
    \"Arn\":\"arn:aws:scheduler:::http-invoke\",
    \"RoleArn\":\"<scheduler-role-arn>\",
    \"HttpParameters\":{
      \"HeaderParameters\":{\"X-Cron-Secret\":\"$CRON_SECRET\",\"Content-Type\":\"application/json\"}
    },
    \"Input\":\"{}\",
    \"HttpMethod\":\"POST\",
    \"Url\":\"https://api.yourdomain.com/api/finance/fee-reminders/dispatch\"
  }"
```

(Easier alternative: just leave the worker-driven scheduler on. The HTTP cron exists for platforms that *don't* support a background container. You have Fargate — the worker covers it.)

---

## 16. Observability

### CloudWatch dashboards
Create a dashboard with these widgets:
- ALB → `RequestCount`, `TargetResponseTime`, `HTTPCode_Target_5XX_Count`
- ECS service → `CPUUtilization`, `MemoryUtilization`, `RunningTaskCount`
- RDS → `CPUUtilization`, `DatabaseConnections`, `FreeableMemory`, `ReadLatency`, `WriteLatency`
- ElastiCache → `CPUUtilization`, `CurrConnections`, `Evictions`

### CloudWatch Alarms (the must-haves)
```bash
# 5xx alarm
aws cloudwatch put-metric-alarm \
  --alarm-name edutrack-5xx-burst \
  --metric-name HTTPCode_Target_5XX_Count --namespace AWS/ApplicationELB \
  --statistic Sum --period 60 --evaluation-periods 2 --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=LoadBalancer,Value=app/edutrack-alb/xxxx \
  --alarm-actions arn:aws:sns:REGION:ACCOUNT:edutrack-alerts

# RDS CPU > 80 for 10 min
aws cloudwatch put-metric-alarm \
  --alarm-name edutrack-rds-cpu \
  --metric-name CPUUtilization --namespace AWS/RDS \
  --statistic Average --period 300 --evaluation-periods 2 --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=DBInstanceIdentifier,Value=edutrack-db \
  --alarm-actions arn:aws:sns:REGION:ACCOUNT:edutrack-alerts
```

### Sentry (already wired)

Set `SENTRY_DSN` in Secrets Manager → the app picks it up automatically (see [backend/app/core/config.py](backend/app/core/config.py)).

---

## 17. Deployment workflow (going forward)

```bash
# 1. Build new image
cd backend
docker build --platform=linux/amd64 -t edutrack-backend:$(git rev-parse --short HEAD) .

# 2. Tag & push
docker tag edutrack-backend:$(git rev-parse --short HEAD) $ECR_URI:$(git rev-parse --short HEAD)
docker tag edutrack-backend:$(git rev-parse --short HEAD) $ECR_URI:latest
docker push $ECR_URI:$(git rev-parse --short HEAD)
docker push $ECR_URI:latest

# 3. Force a new deployment (ECS rolling update — circuit breaker auto-rollbacks on failure)
aws ecs update-service --cluster edutrack --service edutrack-web    --force-new-deployment
aws ecs update-service --cluster edutrack --service edutrack-worker --force-new-deployment
```

You can wire this into a **GitHub Action** later — `aws-actions/configure-aws-credentials` + the four commands above. Keep that for after the manual flow is working end-to-end.

---

## 18. Post-cutover checklist

- [ ] Hit `https://api.yourdomain.com/health` → 200
- [ ] Hit `https://api.yourdomain.com/docs` → Swagger UI loads
- [ ] Frontend on Vercel can log in, fetch a dashboard, upload a file
- [ ] Mobile app (Expo) can log in (CORS + push tokens still flowing)
- [ ] CloudWatch logs show structured JSON, no `ERROR` entries on idle
- [ ] Parent UPI submission end-to-end: parent submits a UTR, admin sees the row in Manual Payments, approves, and the entry shows up in the Finance ledger + summary cards
- [ ] Trigger fee-reminder dispatch manually: `curl -X POST -H "X-Cron-Secret: $CRON_SECRET" https://api.yourdomain.com/api/finance/fee-reminders/dispatch`
- [ ] Force-stop one web task → ECS replaces it within 60s, no client errors
- [ ] Pause for 48h → traffic stable, no errors, then **delete** Render + Neon

---

## 19. Tearing down Render + Neon (only after 48h of clean prod on AWS)

```bash
# Render — Dashboard → each service → Settings → Delete Service
# Neon  — Console → Project → Settings → Delete Project (irreversible)
```

Update local `.env` files / CI secrets:
- Remove `RENDER_*`
- Replace `NEON_DATABASE_URL` with the AWS RDS URL (for local connection if needed; you usually want a separate dev DB)

---

## 20. Common pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| ECS task keeps restarting, "essential container exited" | Missing env var (e.g. SECRET_KEY) | Check task definition's `secrets:` block has every required key |
| Tasks healthy in ECS but ALB 503s | Target group health check on `/` (returns 404) | Set health check path to `/health` |
| `connection refused` to RDS | App SG isn't allowed on RDS SG | Ensure `edutrack-db-sg` allows 5432 *from* `edutrack-app-sg` |
| `redis.exceptions.AuthenticationError` | Missing AUTH token in URL | Use full `rediss://default:TOKEN@host:6379/0` form |
| Image pull rate-limited from Docker Hub | Building `python:3.12-slim` over a bad network | Use ECR's pull-through cache or pin to a digest |
| Worker dispatches reminders twice a week | More than one worker task running | `desiredCount=1`, never auto-scale the worker |
| 502 during deploy | `minimumHealthyPercent=100` not honored / image too slow to boot | Increase `health-check-grace-period-seconds` to 90s |
| Frontend can't talk to API (CORS) | Forgot to add Vercel URL to `FRONTEND_URL` / `ADDITIONAL_CORS_ORIGINS` | Update task def env, redeploy |
| Rate limiter behaves per-replica (i.e. ineffective) | `REDIS_URL` not set or unreachable | Confirm secret resolves; tail logs for `slowapi` warnings |

---

## 21. Reference — full env var list

| Variable | Source | Notes |
|----------|--------|-------|
| `ENVIRONMENT` | task def | `prod` |
| `PORT` | task def | `8000` |
| `WEB_CONCURRENCY` | task def | `4` on 0.5 vCPU / 1 GB |
| `DATABASE_URL` | Secrets Manager | RDS endpoint |
| `REDIS_URL` | Secrets Manager | `rediss://default:TOKEN@host:6379/0` |
| `SECRET_KEY` | Secrets Manager | 32+ chars, `secrets.token_urlsafe(48)` |
| `FRONTEND_URL` | task def | `https://your-app.vercel.app` |
| `ADDITIONAL_CORS_ORIGINS` | task def | comma-sep, optional |
| `COOKIE_SECURE` | task def | `true` |
| `COOKIE_DOMAIN` | task def | `.yourdomain.com` |
| `AWS_S3_BUCKET` | task def | `edutrack-uploads-…` |
| `AWS_S3_REGION` | task def | same as region |
| `FEE_REMINDER_SCHEDULER_ENABLED` | task def | `false` on web, `true` on worker |
| `CRON_SECRET` | Secrets Manager | if you use EventBridge HTTP cron |
| `TWILIO_*` | Secrets Manager | optional |
| `GOOGLE_API_KEY` | Secrets Manager | optional, Question Bank AI |
| `EXPO_ACCESS_TOKEN` | Secrets Manager | push security |
| `SENTRY_DSN` | Secrets Manager | error tracking |
| `LOG_JSON` | task def | `true` |

---

**Done.** Steps 2–13 take ~3 hours the first time, ~30 min once you've scripted it. After that, the workflow is the four commands in **§17**.
