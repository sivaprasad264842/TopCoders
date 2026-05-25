<#
.SYNOPSIS
    Stores production secrets in AWS SSM Parameter Store.

.EXAMPLE
    .\create-ssm-parameters.ps1 `
      -MongoUri              "mongodb+srv://..." `
      -JwtSecret             "long_random_secret" `
      -EmailUser             "you@gmail.com" `
      -EmailPass             "app_password" `
      -OpenAiApiKey          "sk-..." `
      -ExecutionServiceToken "long_random_token"
#>
param(
    [Parameter(Mandatory = $true)]  [string]$MongoUri,
    [Parameter(Mandatory = $true)]  [string]$JwtSecret,
    [Parameter(Mandatory = $true)]  [string]$EmailUser,
    [Parameter(Mandatory = $true)]  [string]$EmailPass,
    [Parameter(Mandatory = $true)]  [string]$OpenAiApiKey,
    [Parameter(Mandatory = $true)]  [string]$ExecutionServiceToken,
    [string]$Region = "ap-south-1"
)

$ErrorActionPreference = "Stop"

$parameters = [ordered]@{
    "/topcoders/MONGO_URI"               = $MongoUri
    "/topcoders/JWT_SECRET"              = $JwtSecret
    "/topcoders/EMAIL_USER"              = $EmailUser
    "/topcoders/EMAIL_PASS"              = $EmailPass
    "/topcoders/OPENAI_API_KEY"          = $OpenAiApiKey
    "/topcoders/EXECUTION_SERVICE_TOKEN" = $ExecutionServiceToken
}

$failed  = @()
$success = @()

foreach ($entry in $parameters.GetEnumerator()) {
    try {
        $output = aws ssm put-parameter `
            --region $Region `
            --name $entry.Key `
            --type SecureString `
            --value $entry.Value `
            --overwrite 2>&1

        if ($LASTEXITCODE -ne 0) {
            $failed  += "$($entry.Key): $output"
        } else {
            $success += $entry.Key
            Write-Host "  OK  $($entry.Key)" -ForegroundColor Green
        }
    } catch {
        $failed += "$($entry.Key): $_"
    }
}

Write-Host ""

if ($failed.Count -eq 0) {
    Write-Host "All $($success.Count) parameters stored successfully." -ForegroundColor Green
} else {
    Write-Host "$($success.Count) stored, $($failed.Count) FAILED:" -ForegroundColor Yellow
    foreach ($f in $failed) {
        Write-Host "  FAIL  $f" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "Most likely cause: your IAM user has a permissions boundary that does not" -ForegroundColor Yellow
    Write-Host "allow ssm:PutParameter. Fix options:" -ForegroundColor Yellow
    Write-Host "  Option A: Remove or update the permissions boundary in IAM Console." -ForegroundColor Yellow
    Write-Host "  Option B: Use the AWS Console to create parameters manually (see DEPLOYMENT.md)." -ForegroundColor Yellow
    exit 1
}