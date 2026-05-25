<#
.SYNOPSIS
    Build Docker images, push to ECR, and deploy to ECS Fargate.
    All default values are pre-filled for the topcoders.online deployment.

.EXAMPLE
    # Full deploy (builds images + deploys):
    .\deploy\deploy.ps1

    # Update ClientUrl only (no rebuild):
    .\deploy\deploy.ps1 -ClientUrl "https://topcoders.netlify.app"
#>
param(
    [string]$AccountId       = "404619633498",
    [string]$ClusterName     = "topcoders",
    [string]$ServiceName     = "topcoders-api",
    [string]$SubnetIds       = "subnet-0bd6f65a92851ff57,subnet-0ec4b1a7a61209264",
    [string]$SecurityGroupId = "sg-0ffa50da26672ef1b",
    [string]$Region          = "ap-south-1",
    # REPLACE: set this to your Netlify URL (e.g. https://topcoders.netlify.app)
    # or your custom domain (https://topcoders.online,https://www.topcoders.online)
    [string]$ClientUrl       = "https://topcoders.online,https://www.topcoders.online",
    [int]   $DesiredCount    = 1
)

$ECR         = "$AccountId.dkr.ecr.$Region.amazonaws.com"
$ProjectRoot = Split-Path $PSScriptRoot -Parent

function Step([int]$n, [int]$total, [string]$msg) {
    Write-Host ""
    Write-Host "[$n/$total] $msg" -ForegroundColor Cyan
}

function Fail([string]$msg) {
    Write-Host ""
    Write-Host "FAILED: $msg" -ForegroundColor Red
    exit 1
}

# ── 0. Preflight ──────────────────────────────────────────────────────────────
Step 0 7 "Checking prerequisites..."

docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Fail "Docker Desktop is not running. Open it, wait until the whale icon stops animating, then re-run."
}
Write-Host "  Docker is running."

aws sts get-caller-identity --region $Region 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Fail "AWS CLI could not authenticate. Run 'aws configure' and check your credentials."
}
Write-Host "  AWS credentials valid."

# ── 1. ECR login ──────────────────────────────────────────────────────────────
Step 1 7 "Logging in to Amazon ECR..."
aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin $ECR
if ($LASTEXITCODE -ne 0) { Fail "ECR login failed." }

# ── 2. ECR repository ─────────────────────────────────────────────────────────
Step 2 7 "Ensuring ECR repository exists..."
$repoCheck = aws ecr describe-repositories --region $Region --repository-names "topcoders" --query "repositories[0].repositoryName" --output text 2>$null
if ($repoCheck -ne "topcoders") {
    aws ecr create-repository --region $Region --repository-name "topcoders" | Out-Null
    Write-Host "  Created: topcoders"
} else {
    Write-Host "  Already exists: topcoders"
}

# ── 3. Build + push backend ───────────────────────────────────────────────────
Step 3 7 "Building backend image..."
docker build -t "${ECR}/topcoders:backend" "$ProjectRoot/Backend"
if ($LASTEXITCODE -ne 0) { Fail "Backend Docker build failed." }
Write-Host "  Pushing..."
docker push "${ECR}/topcoders:backend"
if ($LASTEXITCODE -ne 0) { Fail "Backend image push failed." }

# ── 4. Build + push runner ────────────────────────────────────────────────────
Step 4 7 "Building runner image..."
docker build -t "${ECR}/topcoders:container" "$ProjectRoot/container"
if ($LASTEXITCODE -ne 0) { Fail "Runner Docker build failed." }
Write-Host "  Pushing..."
docker push "${ECR}/topcoders:container"
if ($LASTEXITCODE -ne 0) { Fail "Runner image push failed." }

# ── 5. ECS cluster ────────────────────────────────────────────────────────────
Step 5 7 "Ensuring ECS cluster exists..."
$clusterStatus = aws ecs describe-clusters --region $Region --clusters $ClusterName --query "clusters[?status=='ACTIVE'].clusterName | [0]" --output text 2>$null
if ($clusterStatus -ne $ClusterName) {
    Write-Host "  Cluster not found - creating..."
    aws ecs create-cluster --region $Region --cluster-name $ClusterName --capacity-providers FARGATE --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "Failed to create ECS cluster." }
    Write-Host "  Created: $ClusterName"
} else {
    Write-Host "  Already exists: $ClusterName"
}

# ── 6. Task definition ────────────────────────────────────────────────────────
Step 6 7 "Registering ECS task definition..."

$templatePath = Join-Path $PSScriptRoot "ecs-fargate-task-definition.json"
$taskDefJson  = Get-Content $templatePath -Raw

$taskDefJson = $taskDefJson.Replace("ACCOUNT_ID",            $AccountId)
$taskDefJson = $taskDefJson.Replace("REGION",                $Region)
$taskDefJson = $taskDefJson.Replace("CLIENT_URL_PLACEHOLDER", $ClientUrl)

$tempFile  = Join-Path $env:TEMP "topcoders-task-def.json"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($tempFile, $taskDefJson, $utf8NoBom)

aws logs create-log-group --region $Region --log-group-name "/ecs/topcoders" 2>$null

$taskDefArn = aws ecs register-task-definition --region $Region --cli-input-json "file://$tempFile" --query "taskDefinition.taskDefinitionArn" --output text
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($taskDefArn)) {
    Fail "Failed to register task definition. See the error above."
}
Write-Host "  Registered: $taskDefArn"

# ── 7. ECS service ────────────────────────────────────────────────────────────
Step 7 7 "Deploying ECS service..."

$svcCheck = aws ecs describe-services --region $Region --cluster $ClusterName --services $ServiceName --query "services[?status!='INACTIVE'].serviceName | [0]" --output text 2>$null

if ($svcCheck -eq $ServiceName) {
    aws ecs update-service --region $Region --cluster $ClusterName --service $ServiceName --task-definition $taskDefArn --desired-count $DesiredCount --force-new-deployment | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "Failed to update ECS service." }
    Write-Host "  Updated: $ServiceName"
} else {
    aws ecs create-service --region $Region --cluster $ClusterName --service-name $ServiceName --task-definition $taskDefArn --desired-count $DesiredCount --launch-type FARGATE --network-configuration "awsvpcConfiguration={subnets=[$SubnetIds],securityGroups=[$SecurityGroupId],assignPublicIp=ENABLED}" | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "Failed to create ECS service." }
    Write-Host "  Created: $ServiceName"
}

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Monitor (takes 2-3 min to reach RUNNING):" -ForegroundColor Yellow
Write-Host "  https://$Region.console.aws.amazon.com/ecs/v2/clusters/$ClusterName/services/$ServiceName/tasks"
Write-Host ""
Write-Host "CloudWatch logs:" -ForegroundColor Yellow
Write-Host "  https://$Region.console.aws.amazon.com/cloudwatch/home#logsV2:log-groups/log-group/%2Fecs%2Ftopcoders"