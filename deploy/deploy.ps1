<#
.SYNOPSIS
    Builds both images, pushes them to ECR, registers the task definitions and
    rolls out the backend ECS service. Run setup-aws.ps1 once before this.

.DESCRIPTION
    - Backend:  ECS service "topcoders-backend" (always on, 0.25 vCPU / 512 MB, behind the ALB)
    - Runner:   task definition "topcoders-runner" only. No service: the backend
                starts one runner task per active user and stops it when they leave.

    Images are tagged with a timestamp + git commit, so every deploy is
    traceable and a bad release can be rolled back by re-deploying an old
    task definition revision. The ECS deployment circuit breaker rolls back
    automatically if the new backend never becomes healthy.

.EXAMPLE
    .\deploy\deploy.ps1                                   # build + deploy
    .\deploy\deploy.ps1 -SkipBuild -ClientUrl "https://topcoders.online"   # config-only change
    .\deploy\deploy.ps1 -RunnerCapacityProvider FARGATE_SPOT              # ~70% cheaper runners
#>
param(
    [string]$AwsProfile = "",
    [string]$ClientUrl = "https://topcoders.online,https://www.topcoders.online",
    [ValidateSet("FARGATE", "FARGATE_SPOT")]
    [string]$RunnerCapacityProvider = "FARGATE",
    [int]$MaxRunners = 10,
    [int]$DesiredCount = 1,
    [string]$ServiceName = "topcoders-backend",
    # Comma-separated emails that get admin rights (create hackathons, moderate).
    # Omit to keep the value from the currently deployed task definition.
    [string]$AdminEmails = $null,
    [switch]$SkipBuild,
    [switch]$NoWait
)

. "$PSScriptRoot\lib.ps1"

$config = Read-DeployConfig
if (-not $config) { Fail "deploy/aws-config.json not found. Run .\deploy\setup-aws.ps1 first." }
if (-not $AwsProfile) { $AwsProfile = $config.Profile }

$AccountId = Use-AwsProfile $AwsProfile $config.Region
if ($AccountId -ne $config.AccountId) {
    Fail "Profile '$AwsProfile' is account $AccountId, but aws-config.json is for $($config.AccountId)."
}

$Region      = $config.Region
$Cluster     = $config.ClusterName
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$Registry    = "$AccountId.dkr.ecr.$Region.amazonaws.com"
Write-Host "Deploying to account $AccountId ($Region), cluster $Cluster" -ForegroundColor Yellow

# ── 1. Images ────────────────────────────────────────────────────────────────
if ($SkipBuild) {
    Write-Step "Reusing the currently deployed images"
    $BackendImage = Invoke-Aws ecs describe-task-definition --task-definition topcoders-backend `
        --query "taskDefinition.containerDefinitions[0].image" --output text
    $RunnerImage = Invoke-Aws ecs describe-task-definition --task-definition topcoders-runner `
        --query "taskDefinition.containerDefinitions[0].image" --output text
} else {
    docker info *> $null
    if ($LASTEXITCODE -ne 0) { Fail "Docker is not running. Start Docker Desktop and try again." }

    $sha = & git -C $ProjectRoot rev-parse --short HEAD 2>$null
    $Version = (Get-Date -Format "yyyyMMdd-HHmmss") + $(if ($sha) { "-$sha" } else { "" })
    $BackendImage = "$Registry/topcoders:backend-$Version"
    $RunnerImage  = "$Registry/topcoders:runner-$Version"

    Write-Step "Logging in to ECR"
    aws ecr get-login-password | docker login --username AWS --password-stdin $Registry
    if ($LASTEXITCODE -ne 0) { Fail "ECR login failed." }

    foreach ($image in @(
            @{ Name = "backend"; Tag = $BackendImage; Path = "Backend" },
            @{ Name = "runner";  Tag = $RunnerImage;  Path = "container" })) {
        Write-Step "Building $($image.Name) image"
        docker build --platform linux/amd64 -t $image.Tag (Join-Path $ProjectRoot $image.Path)
        if ($LASTEXITCODE -ne 0) { Fail "$($image.Name) image build failed." }
        docker push $image.Tag
        if ($LASTEXITCODE -ne 0) { Fail "$($image.Name) image push failed." }
    }
}
Write-Ok "backend: $BackendImage"
Write-Ok "runner:  $RunnerImage"

# ── 2. Task definitions ──────────────────────────────────────────────────────
Write-Step "Registering task definitions"
if ($null -eq $AdminEmails) {
    # Keep whatever admins the running backend already has.
    $AdminEmails = & aws ecs describe-task-definition --task-definition topcoders-backend `
        --query "taskDefinition.containerDefinitions[0].environment[?name=='ADMIN_EMAILS'].value | [0]" --output text 2>$null
    if ($LASTEXITCODE -ne 0 -or (Test-Empty $AdminEmails)) { $AdminEmails = "" }
}
$AdminEmails = "$AdminEmails".Trim()
Write-Ok "admins: $(if ($AdminEmails) { $AdminEmails } else { '(none: pass -AdminEmails you@example.com)' })"
$common = @{ ACCOUNT_ID = $AccountId; REGION = $Region }

$runnerFile = New-RenderedFile (Join-Path $PSScriptRoot "ecs-runner-task-definition.json") ($common + @{
    RUNNER_IMAGE = $RunnerImage
})
$runnerArn = Invoke-Aws ecs register-task-definition --cli-input-json (ConvertTo-FileUri $runnerFile) `
    --query "taskDefinition.taskDefinitionArn" --output text
Write-Ok $runnerArn

$backendFile = New-RenderedFile (Join-Path $PSScriptRoot "ecs-backend-task-definition.json") ($common + @{
    BACKEND_IMAGE     = $BackendImage
    CLIENT_URL        = $ClientUrl
    CLUSTER           = $Cluster
    SUBNET_IDS        = $config.SubnetIds
    RUNNER_SG         = $config.RunnerSecurityGroupId
    CAPACITY_PROVIDER = $RunnerCapacityProvider
    MAX_RUNNERS       = $MaxRunners
    ADMIN_EMAILS      = $AdminEmails
})
$backendArn = Invoke-Aws ecs register-task-definition --cli-input-json (ConvertTo-FileUri $backendFile) `
    --query "taskDefinition.taskDefinitionArn" --output text
Write-Ok $backendArn

# ── 3. Backend service ───────────────────────────────────────────────────────
Write-Step "Rolling out service $ServiceName"
$existing = Invoke-Aws ecs describe-services --cluster $Cluster --services $ServiceName `
    --query "services[?status=='ACTIVE'].serviceName | [0]" --output text

if ($existing -eq $ServiceName) {
    Invoke-Aws ecs update-service --cluster $Cluster --service $ServiceName `
        --task-definition $backendArn --desired-count $DesiredCount --force-new-deployment | Out-Null
    Write-Ok "updated"
} else {
    $network = "awsvpcConfiguration={subnets=[$($config.SubnetIds)],securityGroups=[$($config.BackendSecurityGroupId)],assignPublicIp=ENABLED}"
    $loadBalancer = "targetGroupArn=$($config.TargetGroupArn),containerName=backend,containerPort=5000"
    Invoke-Aws ecs create-service --cluster $Cluster --service-name $ServiceName `
        --task-definition $backendArn --desired-count $DesiredCount --launch-type FARGATE `
        --network-configuration $network --load-balancers $loadBalancer `
        --health-check-grace-period-seconds 60 `
        --deployment-configuration "deploymentCircuitBreaker={enable=true,rollback=true},maximumPercent=200,minimumHealthyPercent=100" | Out-Null
    Write-Ok "created"
}

if (-not $NoWait) {
    Write-Step "Waiting for the new backend to become healthy (2-5 minutes)"
    aws ecs wait services-stable --cluster $Cluster --services $ServiceName
    if ($LASTEXITCODE -ne 0) {
        Fail "Service did not stabilise. Check: ECS console -> $Cluster -> $ServiceName -> Events, and CloudWatch /ecs/topcoders."
    }
    Write-Ok "stable"
}

Write-Host ""
Write-Host "Deployment complete." -ForegroundColor Green
Write-Host "  Health:  https://api.topcoders.online/health   (or http://$($config.LoadBalancerDns)/health before DNS/HTTPS)"
Write-Host "  Tasks:   https://$Region.console.aws.amazon.com/ecs/v2/clusters/$Cluster/tasks"
Write-Host "  Logs:    aws logs tail /ecs/topcoders --follow --profile $AwsProfile"
