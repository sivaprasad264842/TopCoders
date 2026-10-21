# Deployment — TopCoders on AWS

Region `ap-south-1` (Mumbai). Frontend on Netlify, API on ECS Fargate behind an ALB, one runner task per active user.

```
Browser ──► Netlify (topcoders.online)
   └──────► api.topcoders.online ──► ALB (HTTPS) ──► backend service (ECS, always on)
                                                        │  RunTask / StopTask
                                                        ▼
                                          runner task per active user (ECS, on demand)
```

All scripts are PowerShell (Windows PowerShell 5.1 or PowerShell 7), idempotent, and stop at the first failing step.

## 0. Prerequisites (once)

1. Install **AWS CLI v2**, **Docker Desktop**, **Node 22**, **Git**.
2. In the new AWS account: IAM → Users → Create user `topcoders-deploy`, attach `AdministratorAccess` for the first setup (afterwards you can switch to `deploy/iam/deployer-policy.json`), then create an access key (CLI).
3. `aws configure --profile topcoders-new` (region `ap-south-1`, output `json`).
4. Set a **billing alarm**: Billing → Budgets → Create budget → monthly cost budget, e.g. $10, with email alerts.

## 1. Bootstrap the account (once)

```powershell
.\deploy\setup-aws.ps1 -AwsProfile topcoders-new
```

This creates the IAM roles, log group, ECR repository, ECS cluster (Fargate + Fargate Spot), three security groups, target group and ALB. It saves the IDs to `deploy/aws-config.json` (gitignored).

| Security group | Inbound | Outbound |
|---|---|---|
| `topcoders-alb-sg` | 80, 443 from internet | all |
| `topcoders-backend-sg` | 5000 from ALB SG | all (MongoDB Atlas, email, OpenAI, runners) |
| `topcoders-runner-sg` | 5001 from backend SG | **443 only** (image pull, logs, secrets) |

## 2. Secrets (once, and whenever one changes)

```powershell
.\deploy\create-ssm-parameters.ps1 -AwsProfile topcoders-new `
    -MongoUri "mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/topcoders" `
    -ResendApiKey "re_..." `
    -OpenAiApiKey "sk-..."
```

`JWT_SECRET` and `EXECUTION_SERVICE_TOKEN` are generated automatically. Treat the old account's values as compromised. Features you skip are stored as `disabled`.

**MongoDB Atlas:** Network Access must allow the backend. Fargate public IPs change on every deploy, so allow `0.0.0.0/0` and rely on a strong database password, or use Atlas private endpoints (paid tiers).

## 3. Deploy (every release)

```powershell
.\deploy\deploy.ps1
```

This builds both images (tagged `backend-<time>-<git sha>` / `runner-<time>-<git sha>`), pushes them to ECR, and registers `topcoders-runner` and `topcoders-backend`. It then creates or updates the `topcoders-backend` service and waits until it is healthy. A failed rollout is rolled back automatically.

Useful flags: `-SkipBuild` (config-only change, reuses current images), `-ClientUrl "..."`, `-RunnerCapacityProvider FARGATE_SPOT`, `-MaxRunners 10`.

## 4. Domain and HTTPS (once)

1. Test over HTTP first: `curl http://<LoadBalancerDns>/health` (DNS name is in `deploy/aws-config.json`).
2. ACM (region **ap-south-1**) → Request public certificate → `api.topcoders.online` → DNS validation. Add the CNAME it shows in GoDaddy and wait for **Issued**.
3. Add HTTPS and redirect HTTP:
   ```powershell
   .\deploy\setup-aws.ps1 -AwsProfile topcoders-new -CertificateArn arn:aws:acm:ap-south-1:...:certificate/...
   ```
4. GoDaddy DNS: `CNAME  api  →  <LoadBalancerDns>` (TTL 600).
5. `curl https://api.topcoders.online/health` returns `{"ok":true,...,"runners":{"mode":"ecs",...}}`.

## 5. Frontend (Netlify)

Site settings → Environment variables → `VITE_API_URL=https://api.topcoders.online/api`, then trigger a deploy (build `npm run build`, publish `dist`, base directory `Frontend`). `netlify.toml` already handles SPA routing.

## Verify

| Check | Expected |
|---|---|
| Open a problem while logged in | Badge shows "Starting sandbox…", then "Sandbox ready" (~30–60 s first time). A task appears in ECS → Tasks |
| Run / Submit | Output and verdict. Logs under `/ecs/topcoders` stream `runner/...` |
| Close the tab | Runner task stops after ~60 s |
| Leave the tab idle 10 min | Runner task stops |
| Two users | Two runner tasks |
| Logout | Runner stops immediately |

## Operations

```powershell
aws logs tail /ecs/topcoders --follow --profile topcoders-new
aws ecs list-tasks --cluster topcoders --profile topcoders-new
aws ecs stop-task --cluster topcoders --task <arn> --profile topcoders-new
.\deploy\deploy.ps1 -SkipBuild -ClientUrl "https://topcoders.online,https://www.topcoders.online"
```

**Rollback:** ECS → service → Update → pick an older `topcoders-backend` revision. Or re-run `deploy.ps1` from an older git commit.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Badge stays "Starting sandbox…", then "unavailable" | Backend logs `[runner] start failed`: check the reason. Usually the runner image is missing in ECR or the SSM parameter `/topcoders/EXECUTION_SERVICE_TOKEN` is missing. |
| `AccessDeniedException` on RunTask | Backend task role missing. Re-run `setup-aws.ps1`. |
| "Lost connection to your code sandbox" | Runner unreachable on 5001: `topcoders-runner-sg` must allow 5001 from `topcoders-backend-sg`. |
| "The code runner is misconfigured" | Backend and runner `EXECUTION_SERVICE_TOKEN` differ. Re-run deploy after fixing SSM. |
| 502/503 from ALB | Backend not healthy yet. Check ECS service Events and the target group health. |
| 504 on long submissions | ALB idle timeout must be 300 s (set by `setup-aws.ps1`). |
| CORS error in browser | `-ClientUrl` must contain the exact frontend origin. Redeploy with `-SkipBuild`. |
| Task stops with `ResourceInitializationError` | Secret missing in SSM or execution role lacks access. Re-run both setup scripts. |

## Monthly cost (approximate, low traffic)

| Item | Cost |
|---|---|
| Backend Fargate task 0.25 vCPU / 0.5 GB, 24/7 | ~$9 |
| ALB (hourly + LCU) | ~$16–18 |
| Public IPv4 addresses (ALB ×2, backend ×1, runners while running) | ~$11 |
| Runner tasks 1 vCPU / 2 GB, ~60 h/month | ~$3 (≈$1 on Spot) |
| ECR, CloudWatch Logs (14-day retention), SSM | < $1 |
| **Total** | **≈ $40/month** (the old always-on 1 vCPU / 3 GB task alone was ≈ $40, before ALB and IPs) |

The ALB and public IPs are the fixed floor. See the project PDF for cheaper alternatives (CloudFront/API Gateway in front instead of an ALB, or a single small EC2 instance).
