# Install the minimum official Android SDK tools needed to sign an offline GG
# APK. No project signing key or password is read or transmitted by this file.
$ErrorActionPreference = 'Stop'
$sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$buildTools = Join-Path $sdkRoot 'build-tools\35.0.0'
$apksigner = Join-Path $buildTools 'apksigner.bat'

if (Test-Path -LiteralPath $apksigner -PathType Leaf) {
    Write-Host "Android APK signing tool is already installed: $apksigner" -ForegroundColor Green
    exit 0
}

$javaExe = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin\java.exe' } else { '' }
if (-not $javaExe -or -not (Test-Path -LiteralPath $javaExe -PathType Leaf)) {
    $jdkRoot = 'D:\program file\jsdk'
    if (Test-Path -LiteralPath $jdkRoot -PathType Container) {
        $javaCandidate = Get-ChildItem -LiteralPath $jdkRoot -Filter java.exe -File -Recurse |
            Select-Object -First 1
        if ($javaCandidate) {
            $env:JAVA_HOME = Split-Path -Parent (Split-Path -Parent $javaCandidate.FullName)
            $javaExe = Join-Path $env:JAVA_HOME 'bin\java.exe'
        }
    }
}
if (-not $javaExe -or -not (Test-Path -LiteralPath $javaExe -PathType Leaf)) {
    throw 'Java JDK was not found. Confirm the installed JDK directory under D:\program file\jsdk.'
}

$sdkmanager = Join-Path $sdkRoot 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not (Test-Path -LiteralPath $sdkmanager -PathType Leaf)) {
    $commandlineUrl = 'https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip'
    $expectedZipSha256 = '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a'
    $tempDir = Join-Path $env:TEMP ('gg-android-commandline-' + [guid]::NewGuid().ToString('N'))
    $zip = Join-Path $tempDir 'commandlinetools.zip'
    $unpack = Join-Path $tempDir 'unpacked'
    New-Item -ItemType Directory -Path $tempDir | Out-Null
    try {
        Write-Host 'Downloading official Android SDK command-line tools (approximately 156 MB)...'
        & "$env:WINDIR\System32\curl.exe" --fail --location --retry 3 --connect-timeout 30 --output $zip $commandlineUrl
        if ($LASTEXITCODE -ne 0) {
            throw 'Official Google download failed. Check connectivity and use https://developer.android.com/studio#command-tools.'
        }
        $actualSha256 = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualSha256 -ne $expectedZipSha256) { throw 'Android SDK tools checksum mismatch. Installation cancelled.' }
        Expand-Archive -LiteralPath $zip -DestinationPath $unpack
        $source = Join-Path $unpack 'cmdline-tools'
        if (-not (Test-Path -LiteralPath (Join-Path $source 'bin\sdkmanager.bat') -PathType Leaf)) {
            throw 'Official Android SDK ZIP has an unexpected layout.'
        }
        $destination = Join-Path $sdkRoot 'cmdline-tools\latest'
        if (Test-Path -LiteralPath $destination) {
            throw "Incomplete Android cmdline-tools installation already exists at $destination. Inspect it manually."
        }
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        Move-Item -LiteralPath $source -Destination $destination
    } finally {
        if (Test-Path -LiteralPath $tempDir) {
            Remove-Item -LiteralPath $tempDir -Recurse -Force
        }
    }
}

if (-not (Test-Path -LiteralPath $sdkmanager -PathType Leaf)) {
    throw "sdkmanager was not installed correctly: $sdkmanager"
}
Write-Host 'Installing Google Android SDK Build-Tools 35.0.0. Accept the official license when prompted.'
& $sdkmanager "--sdk_root=$sdkRoot" 'build-tools;35.0.0'
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $apksigner -PathType Leaf)) {
    throw 'Android SDK Build-Tools installation was incomplete. Review the sdkmanager output.'
}
Write-Host "Installed APK signer: $apksigner" -ForegroundColor Green
