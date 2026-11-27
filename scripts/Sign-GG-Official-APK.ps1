# Sign only the GG Actions official-local unsigned artifact on the owner's
# Windows workstation. The private JKS and passwords never leave this machine.
param(
    [string]$UnsignedApk = (Join-Path $PSScriptRoot 'GG-EdgeOne-CPP-official-unsigned.apk')
)

$ErrorActionPreference = 'Stop'
$officialSha = '70608347ee8cc3cd72e7dc70c504013e261c9a2fee9850539219cda519c87f34'
$expectedBackend = 'https://gg-api.dijiav.top'
$signingDirectory = 'D:\project2\gams\gams-signing-key-official'
$jks = Join-Path $signingDirectory 'GG-release.jks'
$cer = Join-Path $signingDirectory 'GG-release-certificate.cer'

if (-not (Test-Path -LiteralPath $UnsignedApk -PathType Leaf)) {
    throw "Unsigned APK not found: $UnsignedApk. Extract the whole official-local Actions artifact first."
}
if (-not (Test-Path -LiteralPath $jks -PathType Leaf) -or
    -not (Test-Path -LiteralPath $cer -PathType Leaf)) {
    throw "Official JKS or public certificate not found in $signingDirectory"
}

$source = (Resolve-Path -LiteralPath $UnsignedApk).ProviderPath
$parent = Split-Path -Parent $source
$metadataPath = Join-Path $parent 'BUILD-METADATA.txt'
$checksumPath = Join-Path $parent 'SHA256SUMS.txt'
if (-not (Test-Path -LiteralPath $metadataPath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $checksumPath -PathType Leaf)) {
    throw 'Missing official-local BUILD-METADATA.txt or SHA256SUMS.txt; do not sign an unknown APK.'
}
$metadata = @(Get-Content -LiteralPath $metadataPath)
if ($metadata -notcontains 'signing_mode=official-local-unsigned' -or
    $metadata -notcontains "expected_signer_sha256=$officialSha" -or
    $metadata -notcontains "backend_url=$expectedBackend") {
    throw 'The Actions artifact was not built for offline official signing.'
}
$shaLine = (Get-Content -LiteralPath $checksumPath -TotalCount 1).Trim()
if ($shaLine -notmatch '^([0-9a-fA-F]{64})\s+\*?GG-EdgeOne-CPP-official-unsigned\.apk$') {
    throw 'Invalid unsigned APK checksum manifest.'
}
$expectedFileHash = $Matches[1].ToLowerInvariant()
$actualFileHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
if ($expectedFileHash -ne $actualFileHash) {
    throw 'Unsigned APK checksum mismatch; re-download the original Actions artifact.'
}

$certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($cer)
$hash = [System.Security.Cryptography.SHA256]::Create()
try {
    $certificateSha = [BitConverter]::ToString($hash.ComputeHash($certificate.RawData)).Replace('-', '').ToLowerInvariant()
} finally {
    $hash.Dispose()
}
if ($certificateSha -ne $officialSha) { throw 'Local public certificate is not the pinned official GG certificate.' }

$apksigner = $null
if ($env:GG_APKSIGNER_FILE -and (Test-Path -LiteralPath $env:GG_APKSIGNER_FILE -PathType Leaf)) {
    $apksigner = $env:GG_APKSIGNER_FILE
} else {
    $sdkRoots = @($env:ANDROID_SDK_ROOT, $env:ANDROID_HOME,
        (Join-Path $env:LOCALAPPDATA 'Android\Sdk')) |
        Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Container) } |
        Select-Object -Unique
    foreach ($sdkRoot in $sdkRoots) {
        $buildToolsRoot = Join-Path $sdkRoot 'build-tools'
        if (-not (Test-Path -LiteralPath $buildToolsRoot -PathType Container)) { continue }
        $found = Get-ChildItem -LiteralPath $buildToolsRoot -Filter apksigner.bat -File -Recurse |
            Sort-Object FullName -Descending | Select-Object -First 1
        if ($found) { $apksigner = $found.FullName; break }
    }
}
if (-not $apksigner) {
    throw 'apksigner.bat not found. Install Android SDK Build-Tools, or set GG_APKSIGNER_FILE to its full path.'
}

$signed = Join-Path $parent 'GG-EdgeOne-CPP-official-signed.apk'
if (Test-Path -LiteralPath $signed) {
    throw "Signed output already exists: $signed. Move it aside before signing again."
}

Write-Host 'Unsigned artifact hash and official certificate verified.' -ForegroundColor Green
Write-Host 'The signing tool will request your JKS password locally. Never paste it into chat.'
& $apksigner sign --ks $jks --ks-type JKS --ks-key-alias gg-release --v4-signing-enabled false --out $signed $source
if ($LASTEXITCODE -ne 0) { throw "apksigner signing failed with exit code $LASTEXITCODE" }

$verifyLines = @(& $apksigner verify --verbose --print-certs $signed)
if ($LASTEXITCODE -ne 0) { throw 'Signed APK failed apksigner verification.' }
$actualSigner = ''
foreach ($line in $verifyLines) {
    if ($line -match 'certificate SHA-256 digest:\s*([0-9a-fA-F]{64})') {
        $actualSigner = $Matches[1].ToLowerInvariant()
        break
    }
}
if ($actualSigner -ne $officialSha) {
    throw 'Signed APK certificate does not match official GG release signer. Do not install it.'
}

Write-Host 'Official GG APK signed and verified successfully.' -ForegroundColor Green
Write-Host "Output: $signed"
Write-Host "APK SHA256: $((Get-FileHash -LiteralPath $signed -Algorithm SHA256).Hash)"
Write-Host "Certificate SHA256: $actualSigner"
