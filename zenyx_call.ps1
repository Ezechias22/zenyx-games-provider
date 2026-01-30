function Get-Sha256Hex([string]$text) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
  ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join ""
}

function Get-HmacSha256Hex([string]$secret, [string]$payload) {
  $hmac = New-Object System.Security.Cryptography.HMACSHA256
  $hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($secret)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
  ($hmac.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join ""
}

function Invoke-ZenyxApi {
  param(
    [Parameter(Mandatory=$true)][string]$ApiKey,
    [Parameter(Mandatory=$true)][string]$ApiSecret,
    [Parameter(Mandatory=$true)][ValidateSet("GET","POST")][string]$Method,
    [Parameter(Mandatory=$true)][string]$Url,
    [Parameter(Mandatory=$false)][object]$BodyObj
  )

  $ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

  $bodyJson = "{}"
  if ($BodyObj -ne $null) {
    $bodyJson = ($BodyObj | ConvertTo-Json -Depth 20 -Compress)
  }

  $uri = [System.Uri]$Url
  $pathWithQuery = $uri.PathAndQuery

  $bodyHash = Get-Sha256Hex $bodyJson
  $payload = "$ts.$Method.$pathWithQuery.$bodyHash"
  $sig = Get-HmacSha256Hex $ApiSecret $payload

  $headers = @{
    "X-API-KEY"   = $ApiKey
    "X-TIMESTAMP" = "$ts"
    "X-SIGNATURE" = $sig
  }

  if ($Method -eq "GET") {
    return Invoke-RestMethod -Method Get -Uri $Url -Headers $headers
  } else {
    return Invoke-RestMethod -Method Post -Uri $Url -Headers $headers -Body $bodyJson -ContentType "application/json"
  }
}
