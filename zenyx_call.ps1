param(
  [Parameter(Mandatory=$true)][string]$ApiKey,
  [Parameter(Mandatory=$true)][string]$ApiSecret,

  # ✅ NEW (optional) - for /v1/public/*
  [string]$PublicToken,
  [string]$OperatorKey,

  [string]$BaseUrl = "https://zenyx-games-provider-production.up.railway.app",
  [string]$Method = "GET",
  [string]$Path = "/v1/provider/games",
  [string]$BodyJson = "{}"
)

function Sha256Hex([string]$text) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
  $hash = $sha.ComputeHash($bytes)
  ($hash | ForEach-Object { $_.ToString("x2") }) -join ""
}

function HmacSha256Hex([string]$key, [string]$text) {
  $hmac = New-Object System.Security.Cryptography.HMACSHA256
  $hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($key)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
  $hash = $hmac.ComputeHash($bytes)
  ($hash | ForEach-Object { $_.ToString("x2") }) -join ""
}

$methodUpper = $Method.ToUpper()
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

# ---- BODY STABLE (doit matcher JSON.stringify(req.body)) ----
if ($methodUpper -eq "GET" -or [string]::IsNullOrWhiteSpace($BodyJson)) {
  $BodyStable = "{}"
} else {
  # Convert JSON -> object -> JSON compact (équivalent JSON.stringify)
  $BodyStable = ($BodyJson | ConvertFrom-Json) | ConvertTo-Json -Depth 50 -Compress
}

$bodyHash = Sha256Hex $BodyStable

# IMPORTANT: doit matcher req.originalUrl (path seulement, sans domaine)
$payload = "$ts.$methodUpper.$Path.$bodyHash"
$sig = HmacSha256Hex $ApiSecret $payload

$headers = @{
  "X-API-KEY"    = $ApiKey
  "X-SIGNATURE"  = $sig
  "X-TIMESTAMP"  = "$ts"
  "X-REQUEST-ID" = "ps-" + [Guid]::NewGuid().ToString("N")
  "user-agent"   = "ps"
  "accept"       = "application/json"
}

# ✅ Add public headers if provided
if (-not [string]::IsNullOrWhiteSpace($PublicToken)) {
  $headers["x-public-token"] = $PublicToken
}
if (-not [string]::IsNullOrWhiteSpace($OperatorKey)) {
  $headers["x-operator-key"] = $OperatorKey
}

$url = "$BaseUrl$Path"

Write-Host "URL:" $url
Write-Host "BodyStable:" $BodyStable
Write-Host "Payload:" $payload
Write-Host "Signature:" $sig
if ($PublicToken) { Write-Host "x-public-token:" $PublicToken }
if ($OperatorKey) { Write-Host "x-operator-key:" $OperatorKey }

if ($methodUpper -eq "GET") {
  Invoke-RestMethod -Method Get -Uri $url -Headers $headers
} else {
  Invoke-RestMethod -Method $methodUpper -Uri $url -Headers $headers -Body $BodyStable -ContentType "application/json"
}
