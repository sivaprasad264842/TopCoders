# Deployment Guide — TopCoders

## Architecture

```
Browser (topcoders.online)
    │
    ▼ Netlify (static frontend)
    │
    └─► api.topcoders.online
            │
            ▼ AWS ALB → ECS Fargate Task
                ┌──────────────────────────────┐
                │  backend (port 5000)         │
                │     │ http://127.0.0.1:5001  │
                │     ▼                        │
                │  runner  (port 5001)         │
                └──────────────────────────────┘
```

Both containers run inside the **same ECS task**, sharing `localhost`.
The runner is never exposed to the internet — only the backend calls it.

---

## What You Have Already

| Resource | Value |
|---|---|
| AWS Account | `404619633498` |
| Region | `ap-south-1` (Mumbai) |
| ECR repo | `404619633498.dkr.ecr.ap-south-1.amazonaws.com/topcoders` |
| ECS cluster | `topcoders` |
| ECS service | `topcoders-api` |
| Subnets | `subnet-0bd6f65a92851ff57`, `subnet-0ec4b1a7a61209264` |
| ECS security group | `sg-0ffa50da26672ef1b` |
| Frontend | Netlify → `topcoders.online` |
| Domain registrar | GoDaddy (`topcoders.online`) |

---

## What Still Needs To Be Done

1. [Create an Application Load Balancer](#step-1--create-an-application-load-balancer)
2. [Request an SSL certificate](#step-2--request-an-ssl-certificate)
3. [Add HTTPS listener to the ALB](#step-3--add-https-listener)
4. [Point `api.topcoders.online` at the ALB](#step-4--point-domain-to-alb)
5. [Rebuild and redeploy the frontend](#step-5--rebuild-and-redeploy-frontend)

---

## Step 1 — Create an Application Load Balancer

Go to **AWS Console → EC2 → Load Balancers → Create Load Balancer → Application Load Balancer**.

**Basic configuration:**
- Name: `topcoders-alb`
- Scheme: `Internet-facing`
- IP type: `IPv4`

**Network mapping:**
- VPC: your default VPC
- Availability zones: tick both `ap-south-1a` and `ap-south-1b`
- For each AZ, select one of your existing subnets (`subnet-0bd6f65a92851ff57` and `subnet-0ec4b1a7a61209264`)

**Security groups:**
- Remove the default SG
- Click **Create new security group**:
  - Name: `topcoders-alb-sg`
  - Inbound rules: HTTP 80 from `0.0.0.0/0`, HTTPS 443 from `0.0.0.0/0`
  - Outbound rules: All traffic (default)
  - Create
- Select `topcoders-alb-sg`

**Listeners and routing (HTTP:80 only for now):**
- Click **Create target group**:
  - Target type: `IP addresses`
  - Name: `topcoders-tg`
  - Protocol: HTTP, Port: `5000`
  - Health check path: `/health`
  - Create
- Back in the ALB form, select `topcoders-tg` as the target for port 80

**Create the ALB.** It takes 2–3 minutes. Copy the **DNS name** once it appears — it looks like:
```
topcoders-alb-1234567890.ap-south-1.elb.amazonaws.com
```

**Connect ECS to the ALB** — Go to **ECS → Clusters → topcoders → Services → topcoders-api → Update**:
- Load balancer type: Application Load Balancer
- Load balancer: `topcoders-alb`
- Container to load balance: `backend : 5000`
- Target group: `topcoders-tg`
- Update service

**Lock down the ECS security group** — Go to **EC2 → Security Groups → `sg-0ffa50da26672ef1b` → Edit inbound rules**:
- Remove the existing port 5000 rule that allows `0.0.0.0/0`
- Add: Custom TCP, Port `5000`, Source = `topcoders-alb-sg` (select by name)
- Save

---

## Step 2 — Request an SSL Certificate

Go to **AWS Certificate Manager → Request certificate**:
- Type: Public certificate
- Domain names: add both:
  - `api.topcoders.online`
  - `topcoders.online`
  - `www.topcoders.online`
- Validation method: DNS validation
- Request

Click the pending certificate, then **Create records in Route 53** — or copy the CNAME name/value and add them manually in GoDaddy under **DNS → Add Record → CNAME**.

Wait until the certificate status changes to **Issued** (usually 5–10 minutes after the DNS records are added).

---

## Step 3 — Add HTTPS Listener

Go to **EC2 → Load Balancers → topcoders-alb → Listeners → Add listener**:
- Protocol: HTTPS, Port: 443
- Default action: Forward to `topcoders-tg`
- Certificate: select the one you just issued
- Add

Then **edit the HTTP 80 listener**:
- Default action: Redirect to HTTPS 443
- Save

---

## Step 4 — Point Domain to ALB

In **GoDaddy → DNS** for `topcoders.online`, add:

| Type  | Name  | Value |
|-------|-------|-------|
| CNAME | `api` | `<your-alb-dns-name>` |

Replace `<your-alb-dns-name>` with the ALB DNS name you copied in Step 1.

DNS propagation takes 5–30 minutes. Test with:

```powershell
curl https://api.topcoders.online/health
```

Expected response:
```json
{"ok":true,"service":"backend"}
```

---

## Step 5 — Rebuild and Redeploy Frontend

Create `d:\OJ\Frontend\.env` (not `.env.example`):

```env
VITE_API_URL=https://api.topcoders.online/api
```

Build:

```powershell
cd d:\OJ\Frontend
npm install
npm run build
```

The output is in `Frontend\dist\`. Deploy to Netlify:

**Option A — Netlify CLI:**
```powershell
npx netlify deploy --prod --dir dist
```

**Option B — Netlify Dashboard:**
Go to your Netlify site → **Deploys → drag and drop the `dist` folder**.

---

## Redeploying After Backend/Runner Code Changes

Run from `d:\OJ\`:

```powershell
.\deploy\deploy.ps1
```

All parameters are already pre-filled with real values. The script will:
1. Build and push new Docker images to ECR
2. Register an updated ECS task definition
3. Force ECS to restart with the new images

Takes ~5 minutes. Monitor progress:
- **ECS tasks:** `https://ap-south-1.console.aws.amazon.com/ecs/v2/clusters/topcoders/services/topcoders-api/tasks`
- **CloudWatch logs:** `https://ap-south-1.console.aws.amazon.com/cloudwatch/home#logsV2:log-groups/log-group/%2Fecs%2Ftopcoders`

---

## Updating Secrets in SSM

If you need to change a secret (e.g. rotate the JWT secret):

```powershell
aws ssm put-parameter `
  --region ap-south-1 `
  --name "/topcoders/JWT_SECRET" `
  --value "new_secret_here" `
  --type SecureString `
  --overwrite
```

Then redeploy so ECS picks up the new value:

```powershell
.\deploy\deploy.ps1
```

SSM parameters used by this project:

| Parameter | Description |
|---|---|
| `/topcoders/MONGO_URI` | MongoDB Atlas connection string |
| `/topcoders/JWT_SECRET` | JWT signing secret (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `/topcoders/EMAIL_USER` | Gmail address for sending emails |
| `/topcoders/EMAIL_PASS` | Gmail App Password (16-char code from Google Account → Security → App Passwords) |
| `/topcoders/OPENAI_API_KEY` | OpenAI API key (leave empty to disable AI analysis) |
| `/topcoders/EXECUTION_SERVICE_TOKEN` | Shared secret between backend and runner |

---

## Troubleshooting

| Symptom | Where to look |
|---|---|
| ECS task keeps stopping | ECS → Clusters → topcoders → Tasks → click task → Logs tab |
| "Run Code" returns error | CloudWatch → /ecs/topcoders → runner log stream |
| Backend not reachable | EC2 → Load Balancers → topcoders-alb → Target Groups → check `topcoders-tg` health |
| 502 Bad Gateway | ECS task may still be starting — wait 2 min and retry |
| Email not sending | Check SSM has correct EMAIL_USER and EMAIL_PASS |
| SSL certificate not working | Confirm CNAME validation records exist in GoDaddy DNS |

---

## Security Checklist

- `.env` files are in `.gitignore` — never commit them
- All runtime secrets live in SSM Parameter Store — never in Docker images
- The runner container has no public inbound access — only the backend calls it on localhost
- ECS security group only allows port 5000 from the ALB security group
- Rotate any secret that was ever committed to git or shared in chat