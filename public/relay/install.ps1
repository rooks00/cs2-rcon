# Relay's temporary native helper. No administrator rights or installed runtime.
param([Parameter(Mandatory = $true)][string]$Site, [int]$Port = 47391, [switch]$NoOpen, [switch]$BrowserConnect)
$ErrorActionPreference = 'Stop'
$relaySite = $Site.TrimEnd('/')
$relayUri = [Uri]$relaySite
if (-not $relayUri.IsAbsoluteUri -or $relayUri.UserInfo -or $relayUri.Query -or $relayUri.Fragment -or $relayUri.AbsolutePath -ne '/' -or ($relayUri.Scheme -ne 'https' -and -not ($relayUri.Scheme -eq 'http' -and $relayUri.IsLoopback))) {
    throw 'Use your HTTPS Relay website origin without a path or credentials.'
}
$relayArchName = $env:PROCESSOR_ARCHITEW6432
if (-not $relayArchName) { $relayArchName = $env:PROCESSOR_ARCHITECTURE }
switch ($relayArchName.ToUpperInvariant()) {
    'AMD64' { $relayArch = 'amd64' }
    'ARM64' { $relayArch = 'arm64' }
    default { throw 'Use a 64-bit Windows computer (Intel/AMD or ARM).' }
}
$relayDir = Join-Path ([IO.Path]::GetTempPath()) ('relay-helper-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $relayDir | Out-Null
try {
    $relayName = "relay-helper-windows-$relayArch.exe"
    $relayBase = "$relaySite/relay/v0.2.0/$relayName.gz"
    $relayArchive = Join-Path $relayDir 'helper.gz'
    Write-Host 'Downloading Relay Helper. No installation or administrator privileges required.'
    Invoke-WebRequest -UseBasicParsing -Uri $relayBase -OutFile $relayArchive -TimeoutSec 180
    $relayChecksum = Join-Path $relayDir 'checksum'
    Invoke-WebRequest -UseBasicParsing -Uri "$relayBase.sha256" -OutFile $relayChecksum -TimeoutSec 30
    $relayExpected = (Get-Content -LiteralPath $relayChecksum -Raw).Trim()
    $relayActual = (Get-FileHash -Path $relayArchive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($relayExpected -notmatch '^[a-fA-F0-9]{64}$' -or $relayExpected.ToLowerInvariant() -ne $relayActual) {
        throw 'Download checksum did not match. Nothing was executed.'
    }
    $relayBinary = Join-Path $relayDir $relayName
    $relayInput = [IO.File]::OpenRead($relayArchive)
    try {
        $relayGzip = [IO.Compression.GZipStream]::new($relayInput, [IO.Compression.CompressionMode]::Decompress)
        try {
            $relayOutput = [IO.File]::Create($relayBinary)
            try { $relayGzip.CopyTo($relayOutput) } finally { $relayOutput.Dispose() }
        } finally { $relayGzip.Dispose() }
    } finally { $relayInput.Dispose() }
    $relayArguments = @('--site', $relaySite, '--port', [string]$Port)
    if ($BrowserConnect) { $relayArguments += '--browser-connect' }
    if ($NoOpen) { $relayArguments += '--no-open' }
    & $relayBinary @relayArguments
    if ($LASTEXITCODE -ne 0) { throw "Relay Helper exited with code $LASTEXITCODE." }
} finally {
    Remove-Item -Recurse -Force -LiteralPath $relayDir -ErrorAction SilentlyContinue
}
