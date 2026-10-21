# Shared helpers for the deploy scripts. Dot-source it: . "$PSScriptRoot\lib.ps1"
# Works on Windows PowerShell 5.1 and PowerShell 7.

$ConfigPath = Join-Path $PSScriptRoot "aws-config.json"

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "    $Message" -ForegroundColor Green
}

function Fail([string]$Message) {
    Write-Host ""
    Write-Host "FAILED: $Message" -ForegroundColor Red
    exit 1
}

# Runs the AWS CLI and stops the script if it fails. Returns trimmed text output.
# A simple function (no param block) so arguments like --query pass straight through.
function Invoke-Aws {
    $result = & aws @args
    if ($LASTEXITCODE -ne 0) { Fail "aws $($args -join ' ')" }
    if ($null -eq $result) { return "" }
    return ($result -join "`n").Trim()
}

# Runs the AWS CLI and only reports success; errors are expected (e.g. "not found").
function Test-Aws {
    & aws @args 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0)
}

# "None" is what --output text prints for an empty result.
function Test-Empty([string]$Value) {
    return [string]::IsNullOrWhiteSpace($Value) -or $Value -eq "None"
}

function Use-AwsProfile([string]$AwsProfile, [string]$Region) {
    if ($AwsProfile) { $env:AWS_PROFILE = $AwsProfile }
    $env:AWS_DEFAULT_REGION = $Region
    $env:AWS_PAGER = ""   # never open a pager inside a script

    if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
        Fail "AWS CLI v2 is not installed. Get it from https://aws.amazon.com/cli/"
    }
    $account = & aws sts get-caller-identity --query Account --output text
    if ($LASTEXITCODE -ne 0 -or (Test-Empty $account)) {
        Fail "AWS CLI could not authenticate. Run: aws configure --profile $AwsProfile"
    }
    return $account.Trim()
}

# Writes UTF-8 without a BOM (the AWS CLI rejects JSON files that start with a BOM).
function Write-Utf8File([string]$Path, [string]$Content) {
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

# Fills __PLACEHOLDER__ tokens in a template and returns a temp file path for file://.
function New-RenderedFile([string]$Template, [hashtable]$Values) {
    $text = Get-Content -Raw -Path $Template
    foreach ($key in $Values.Keys) {
        $text = $text.Replace("__${key}__", [string]$Values[$key])
    }
    if ($text -match "__[A-Z_]+__") { Fail "Unfilled placeholder $($Matches[0]) in $Template" }

    $out = Join-Path ([System.IO.Path]::GetTempPath()) ("topcoders-" + [System.IO.Path]::GetFileName($Template))
    Write-Utf8File $out $text
    return $out
}

# file:// URI the AWS CLI accepts on Windows (forward slashes).
function ConvertTo-FileUri([string]$Path) {
    return "file://" + ($Path -replace "\\", "/")
}

function Read-DeployConfig {
    if (-not (Test-Path $ConfigPath)) { return $null }
    return Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json
}
