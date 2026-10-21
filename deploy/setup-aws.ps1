<#
.SYNOPSIS
    One-time setup of a fresh AWS account for TopCoders. Safe to re-run.

.DESCRIPTION
    Creates (or reuses):
      - IAM: ecsTaskExecutionRole (pull images, read /topcoders/* secrets)
             topcoders-backend-task-role (start/stop runner tasks in this cluster only)
      - CloudWatch log group /ecs/topcoders (14-day retention)
      - ECR repository "topcoders" (keeps the 20 newest images)
      - ECS cluster with FARGATE and FARGATE_SPOT capacity providers
      - Security groups in the default VPC:
            topcoders-alb-sg      80/443 from the internet
            topcoders-backend-sg  5000 from the ALB only
            topcoders-runner-sg   5001 from the backend only; outbound HTTPS only
      - Target group + internet-facing Application Load Balancer (idle timeout 300 s)
    and writes the IDs to deploy/aws-config.json for deploy.ps1.

    Run it once without -CertificateArn (HTTP only). After ACM issues your
    certificate, run it again with -CertificateArn to add HTTPS and redirect HTTP.

.EXAMPLE
    .\deploy\setup-aws.ps1 -AwsProfile topcoders-new
    .\deploy\setup-aws.ps1 -AwsProfile topcoders-new -CertificateArn arn:aws:acm:ap-south-1:123456789012:certificate/abc
#>
param(
    [string]$AwsProfile     = "topcoders-new",
    [string]$Region         = "ap-south-1",
    [string]$ClusterName    = "topcoders",
    [string]$CertificateArn = ""
)

. "$PSScriptRoot\lib.ps1"

$AccountId = Use-AwsProfile $AwsProfile $Region
Write-Host "AWS account $AccountId, region $Region" -ForegroundColor Yellow

function Confirm-Role([string]$Name) {
    if (Test-Aws iam get-role --role-name $Name) {
        Write-Ok "exists   $Name"
    } else {
        $trust = ConvertTo-FileUri (Join-Path $PSScriptRoot "iam\ecs-tasks-trust-policy.json")
        Invoke-Aws iam create-role --role-name $Name --assume-role-policy-document $trust | Out-Null
        Write-Ok "created  $Name"
    }
}

function Confirm-SecurityGroup([string]$Name, [string]$Description) {
    $id = Invoke-Aws ec2 describe-security-groups `
        --filters "Name=vpc-id,Values=$VpcId" "Name=group-name,Values=$Name" `
        --query "SecurityGroups[0].GroupId" --output text
    if (Test-Empty $id) {
        $id = Invoke-Aws ec2 create-security-group --group-name $Name --description $Description `
            --vpc-id $VpcId --query GroupId --output text
        Write-Ok "created  $Name ($id)"
    } else {
        Write-Ok "exists   $Name ($id)"
    }
    return $id
}

# Adds a rule; "already exists" is fine, anything else stops the script.
function Add-Rule([string]$Direction, [string]$GroupId, [string]$Permission) {
    $out = & aws ec2 "authorize-security-group-$Direction" --group-id $GroupId --ip-permissions $Permission 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0 -and $out -notmatch "Duplicate") {
        Fail "Could not add $Direction rule to ${GroupId}: $out"
    }
}

# ── 1. IAM roles ─────────────────────────────────────────────────────────────
Write-Step "IAM roles"

if (-not (Test-Aws iam get-role --role-name AWSServiceRoleForECS)) {
    Invoke-Aws iam create-service-linked-role --aws-service-name ecs.amazonaws.com | Out-Null
    Write-Ok "created  AWSServiceRoleForECS"
}

Confirm-Role "ecsTaskExecutionRole"
Invoke-Aws iam attach-role-policy --role-name ecsTaskExecutionRole `
    --policy-arn "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy" | Out-Null
$secretsPolicy = New-RenderedFile (Join-Path $PSScriptRoot "iam\execution-role-secrets-policy.json") @{
    ACCOUNT_ID = $AccountId; REGION = $Region
}
Invoke-Aws iam put-role-policy --role-name ecsTaskExecutionRole --policy-name topcoders-read-secrets `
    --policy-document (ConvertTo-FileUri $secretsPolicy) | Out-Null
Write-Ok "policies ecsTaskExecutionRole: image pull + /topcoders/* secrets"

Confirm-Role "topcoders-backend-task-role"
$taskPolicy = New-RenderedFile (Join-Path $PSScriptRoot "iam\backend-task-role-policy.json") @{
    ACCOUNT_ID = $AccountId; REGION = $Region; CLUSTER = $ClusterName
}
Invoke-Aws iam put-role-policy --role-name topcoders-backend-task-role --policy-name runner-control `
    --policy-document (ConvertTo-FileUri $taskPolicy) | Out-Null
Write-Ok "policies topcoders-backend-task-role: run/stop runner tasks in '$ClusterName' only"

# ── 2. Logs ──────────────────────────────────────────────────────────────────
Write-Step "CloudWatch log group"
$logGroup = Invoke-Aws logs describe-log-groups --log-group-name-prefix "/ecs/topcoders" `
    --query "logGroups[?logGroupName=='/ecs/topcoders'].logGroupName | [0]" --output text
if (Test-Empty $logGroup) {
    Invoke-Aws logs create-log-group --log-group-name "/ecs/topcoders" | Out-Null
}
Invoke-Aws logs put-retention-policy --log-group-name "/ecs/topcoders" --retention-in-days 14 | Out-Null
Write-Ok "/ecs/topcoders (14-day retention)"

# ── 3. ECR ───────────────────────────────────────────────────────────────────
Write-Step "ECR repository"
if (-not (Test-Aws ecr describe-repositories --repository-names topcoders)) {
    Invoke-Aws ecr create-repository --repository-name topcoders `
        --image-scanning-configuration "scanOnPush=true" | Out-Null
}
Invoke-Aws ecr put-lifecycle-policy --repository-name topcoders `
    --lifecycle-policy-text (ConvertTo-FileUri (Join-Path $PSScriptRoot "ecr-lifecycle-policy.json")) | Out-Null
Write-Ok "$AccountId.dkr.ecr.$Region.amazonaws.com/topcoders (scan on push, keeps 20 newest)"

# ── 4. ECS cluster ───────────────────────────────────────────────────────────
Write-Step "ECS cluster"
$clusterStatus = Invoke-Aws ecs describe-clusters --clusters $ClusterName --query "clusters[0].status" --output text
if ($clusterStatus -ne "ACTIVE") {
    Invoke-Aws ecs create-cluster --cluster-name $ClusterName | Out-Null
}
Invoke-Aws ecs put-cluster-capacity-providers --cluster $ClusterName `
    --capacity-providers FARGATE FARGATE_SPOT `
    --default-capacity-provider-strategy "capacityProvider=FARGATE,weight=1" | Out-Null
Write-Ok "$ClusterName (FARGATE + FARGATE_SPOT)"

# ── 5. Network ───────────────────────────────────────────────────────────────
Write-Step "Network (default VPC)"
$VpcId = Invoke-Aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text
if (Test-Empty $VpcId) { Fail "No default VPC. Create one with: aws ec2 create-default-vpc" }

$subnetText = Invoke-Aws ec2 describe-subnets `
    --filters "Name=vpc-id,Values=$VpcId" "Name=default-for-az,Values=true" `
    --query "Subnets[].SubnetId" --output text
$SubnetIds = @($subnetText -split "\s+" | Where-Object { $_ } | Sort-Object)
if ($SubnetIds.Count -lt 2) { Fail "Need at least 2 default subnets in $VpcId (found $($SubnetIds.Count))." }
# Two AZs are enough for the ALB; each extra AZ adds a billed public IPv4 address.
# Tasks use the same subnets so they always land in an AZ the ALB serves.
$SubnetIds = @($SubnetIds[0..1])
Write-Ok "VPC $VpcId, subnets $($SubnetIds -join ', ')"

$AlbSg     = Confirm-SecurityGroup "topcoders-alb-sg"     "TopCoders load balancer: HTTP/HTTPS from the internet"
$BackendSg = Confirm-SecurityGroup "topcoders-backend-sg" "TopCoders API: port 5000 from the load balancer only"
$RunnerSg  = Confirm-SecurityGroup "topcoders-runner-sg"  "TopCoders code runners: port 5001 from the API only"

Add-Rule ingress $AlbSg     "IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0}]"
Add-Rule ingress $AlbSg     "IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}]"
Add-Rule ingress $BackendSg "IpProtocol=tcp,FromPort=5000,ToPort=5000,UserIdGroupPairs=[{GroupId=$AlbSg}]"
Add-Rule ingress $RunnerSg  "IpProtocol=tcp,FromPort=5001,ToPort=5001,UserIdGroupPairs=[{GroupId=$BackendSg}]"

# Runners execute untrusted code: allow outbound HTTPS only (image pull, logs,
# secrets) instead of the default "all traffic".
Add-Rule egress $RunnerSg "IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}]"
Test-Aws ec2 revoke-security-group-egress --group-id $RunnerSg `
    --ip-permissions "IpProtocol=-1,IpRanges=[{CidrIp=0.0.0.0/0}]" | Out-Null
Write-Ok "rules: internet -> ALB:80/443 -> backend:5000 -> runner:5001; runner egress 443 only"

# ── 6. Load balancer ─────────────────────────────────────────────────────────
Write-Step "Application Load Balancer"
$TargetGroupArn = Invoke-Aws elbv2 describe-target-groups `
    --query "TargetGroups[?TargetGroupName=='topcoders-tg'].TargetGroupArn | [0]" --output text
if (Test-Empty $TargetGroupArn) {
    $TargetGroupArn = Invoke-Aws elbv2 create-target-group --name topcoders-tg --protocol HTTP --port 5000 `
        --vpc-id $VpcId --target-type ip --health-check-path /health `
        --health-check-interval-seconds 15 --healthy-threshold-count 2 `
        --query "TargetGroups[0].TargetGroupArn" --output text
}
# Drain old tasks in 30 s instead of the default 5 minutes during deploys.
Invoke-Aws elbv2 modify-target-group-attributes --target-group-arn $TargetGroupArn `
    --attributes "Key=deregistration_delay.timeout_seconds,Value=30" | Out-Null
Write-Ok "target group topcoders-tg -> port 5000, health check /health"

$AlbArn = Invoke-Aws elbv2 describe-load-balancers `
    --query "LoadBalancers[?LoadBalancerName=='topcoders-alb'].LoadBalancerArn | [0]" --output text
if (Test-Empty $AlbArn) {
    $AlbArn = Invoke-Aws elbv2 create-load-balancer --name topcoders-alb --type application `
        --scheme internet-facing --subnets @SubnetIds --security-groups $AlbSg `
        --query "LoadBalancers[0].LoadBalancerArn" --output text
}
# Submissions with many tests can take minutes; the default 60 s would cut them off.
Invoke-Aws elbv2 modify-load-balancer-attributes --load-balancer-arn $AlbArn `
    --attributes "Key=idle_timeout.timeout_seconds,Value=300" | Out-Null
$AlbDns = Invoke-Aws elbv2 describe-load-balancers --load-balancer-arns $AlbArn `
    --query "LoadBalancers[0].DNSName" --output text
Write-Ok "topcoders-alb: $AlbDns (idle timeout 300 s)"

$listenerText = Invoke-Aws elbv2 describe-listeners --load-balancer-arn $AlbArn `
    --query "Listeners[].[Port,ListenerArn]" --output text
$Listeners = @{}
foreach ($line in ($listenerText -split "`n" | Where-Object { $_.Trim() })) {
    $port, $arn = $line.Trim() -split "\s+"
    $Listeners[$port] = $arn
}

$forward = "Type=forward,TargetGroupArn=$TargetGroupArn"
if ($CertificateArn) {
    if (-not $Listeners.ContainsKey("443")) {
        Invoke-Aws elbv2 create-listener --load-balancer-arn $AlbArn --protocol HTTPS --port 443 `
            --certificates "CertificateArn=$CertificateArn" `
            --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06 --default-actions $forward | Out-Null
    }
    $redirect = "Type=redirect,RedirectConfig={Protocol=HTTPS,Port=443,StatusCode=HTTP_301}"
    if ($Listeners.ContainsKey("80")) {
        Invoke-Aws elbv2 modify-listener --listener-arn $Listeners["80"] --default-actions $redirect | Out-Null
    } else {
        Invoke-Aws elbv2 create-listener --load-balancer-arn $AlbArn --protocol HTTP --port 80 `
            --default-actions $redirect | Out-Null
    }
    Write-Ok "listeners: HTTPS 443 -> backend, HTTP 80 -> redirect to HTTPS"
} elseif (-not $Listeners.ContainsKey("80")) {
    Invoke-Aws elbv2 create-listener --load-balancer-arn $AlbArn --protocol HTTP --port 80 `
        --default-actions $forward | Out-Null
    Write-Ok "listener: HTTP 80 -> backend (re-run with -CertificateArn to add HTTPS)"
} else {
    Write-Ok "listeners already configured"
}

# ── 7. Save for deploy.ps1 ───────────────────────────────────────────────────
$config = [ordered]@{
    AccountId              = $AccountId
    Region                 = $Region
    Profile                = $AwsProfile
    ClusterName            = $ClusterName
    VpcId                  = $VpcId
    SubnetIds              = ($SubnetIds -join ",")
    AlbSecurityGroupId     = $AlbSg
    BackendSecurityGroupId = $BackendSg
    RunnerSecurityGroupId  = $RunnerSg
    TargetGroupArn         = $TargetGroupArn
    LoadBalancerDns        = $AlbDns
}
Write-Utf8File $ConfigPath ($config | ConvertTo-Json)

Write-Host ""
Write-Host "Setup complete. Saved $ConfigPath" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Store secrets:   .\deploy\create-ssm-parameters.ps1 -AwsProfile $AwsProfile -MongoUri '...' -ResendApiKey '...'"
Write-Host "  2. Deploy:          .\deploy\deploy.ps1"
Write-Host "  3. DNS (GoDaddy):   CNAME  api  ->  $AlbDns"
if (-not $CertificateArn) {
    Write-Host "  4. HTTPS:           request an ACM certificate for api.topcoders.online, then re-run:"
    Write-Host "                      .\deploy\setup-aws.ps1 -AwsProfile $AwsProfile -CertificateArn <arn>"
}
