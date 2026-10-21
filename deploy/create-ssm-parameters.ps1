<#
.SYNOPSIS
    Stores the production secrets in AWS SSM Parameter Store (encrypted SecureString).
    ECS injects them into the containers at start-up; they are never baked into images.

.DESCRIPTION
    - JwtSecret / ExecutionServiceToken: generated for you if omitted (and kept if
      they already exist, so re-running does not log everyone out).
    - Optional features you do not use can be omitted; they are stored as
      "disabled" and the backend treats that as "not configured".
    - Secret values are never printed.

.EXAMPLE
    .\deploy\create-ssm-parameters.ps1 -AwsProfile topcoders-new `
        -MongoUri "mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/topcoders" `
        -ResendApiKey "re_..." -OpenAiApiKey "sk-..."
#>
param(
    [Parameter(Mandatory = $true)] [string]$MongoUri,
    [string]$JwtSecret = "",
    [string]$ExecutionServiceToken = "",
    [string]$ResendApiKey = "",
    [string]$EmailUser = "",
    [string]$EmailPass = "",
    [string]$OpenAiApiKey = "",
    [string]$AwsProfile = "topcoders-new",
    [string]$Region = "ap-south-1",
    # Regenerate JWT_SECRET and EXECUTION_SERVICE_TOKEN even if they exist (logs everyone out).
    [switch]$RotateGenerated
)

. "$PSScriptRoot\lib.ps1"

$AccountId = Use-AwsProfile $AwsProfile $Region
Write-Host "Storing secrets in account $AccountId ($Region)" -ForegroundColor Yellow

function New-RandomHex {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
}

function Test-Parameter([string]$Name) {
    return Test-Aws ssm get-parameter --name $Name
}

if (-not $ResendApiKey -and -not ($EmailUser -and $EmailPass)) {
    Write-Host "WARNING: no email provider given (-ResendApiKey or -EmailUser/-EmailPass)." -ForegroundColor Yellow
    Write-Host "         Registration emails will fail until you add one." -ForegroundColor Yellow
}

$parameters = [ordered]@{
    "/topcoders/MONGO_URI"      = $MongoUri
    "/topcoders/RESEND_API_KEY" = $(if ($ResendApiKey) { $ResendApiKey } else { "disabled" })
    "/topcoders/EMAIL_USER"     = $(if ($EmailUser) { $EmailUser } else { "disabled" })
    "/topcoders/EMAIL_PASS"     = $(if ($EmailPass) { $EmailPass } else { "disabled" })
    "/topcoders/OPENAI_API_KEY" = $(if ($OpenAiApiKey) { $OpenAiApiKey } else { "disabled" })
}

foreach ($generated in @(
        @{ Name = "/topcoders/JWT_SECRET"; Value = $JwtSecret },
        @{ Name = "/topcoders/EXECUTION_SERVICE_TOKEN"; Value = $ExecutionServiceToken })) {
    if ($generated.Value) {
        $parameters[$generated.Name] = $generated.Value
    } elseif ($RotateGenerated -or -not (Test-Parameter $generated.Name)) {
        $parameters[$generated.Name] = New-RandomHex
    } else {
        Write-Ok "kept     $($generated.Name) (already set; use -RotateGenerated to replace)"
    }
}

# Each value goes through a temp JSON file, so quotes, spaces and & in
# passwords or URIs cannot break the command line. The file is deleted at once.
$tempFile = Join-Path ([System.IO.Path]::GetTempPath()) "topcoders-ssm-$([guid]::NewGuid()).json"
try {
    foreach ($entry in $parameters.GetEnumerator()) {
        $request = @{ Name = $entry.Key; Value = $entry.Value; Type = "SecureString"; Overwrite = $true }
        Write-Utf8File $tempFile ($request | ConvertTo-Json -Compress)
        & aws ssm put-parameter --cli-input-json (ConvertTo-FileUri $tempFile) | Out-Null
        if ($LASTEXITCODE -ne 0) { Fail "Could not store $($entry.Key) (see the error above)." }
        Write-Ok "stored   $($entry.Key)"
    }
} finally {
    Remove-Item -Force -ErrorAction SilentlyContinue $tempFile
}

Write-Host ""
Write-Host "All secrets stored. Run .\deploy\deploy.ps1 next." -ForegroundColor Green
