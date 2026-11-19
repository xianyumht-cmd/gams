# Windows PowerShell 5.1 helper for private GG runtime provisioning.
# Run locally. Never put your EdgeOne API Token or JS files in GitHub Actions.
[CmdletBinding()]
param(
    [ValidatePattern('^(makers|pages)-[a-z0-9]+$')]
    [string]$ProjectId = 'makers-v0q1urwnypkn',
    [ValidateNotNullOrEmpty()]
    [string]$RuntimeVersion = '1.4.1-1.0.41'
)

$ErrorActionPreference = 'Stop'
$adminRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

function Find-Executable {
    param([string[]]$Names)
    foreach ($name in $Names) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command) { return $command.Source }
    }
    throw ('Missing required program: ' + ($Names -join ' / '))
}

function Run-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw ('Command failed with exit code ' + $LASTEXITCODE + ': ' + $Program)
    }
}

function Choose-JavaScript {
    param([string]$Title)
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    try {
        $dialog.Title = $Title
        $dialog.Filter = 'JavaScript files (*.js)|*.js|All files (*.*)|*.*'
        $dialog.CheckFileExists = $true
        $dialog.Multiselect = $false
        if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
            throw 'File selection canceled. No files were uploaded.'
        }
        return $dialog.FileName
    } finally {
        $dialog.Dispose()
    }
}

Write-Host '=== GG EdgeOne private JS upload ===' -ForegroundColor Cyan
Write-Host ('Project: ' + $ProjectId)
Write-Host ('Runtime version: ' + $RuntimeVersion)
Write-Host 'The API Token will be requested privately after local preparation.'
Write-Host 'Never share the Token or the generated license key in screenshots.'

if (-not (Test-Path -LiteralPath (Join-Path $adminRoot 'scripts\provision.mjs') -PathType Leaf) -or
    -not (Test-Path -LiteralPath (Join-Path $adminRoot 'scripts\pack_runtime.py') -PathType Leaf) -or
    -not (Test-Path -LiteralPath (Join-Path $adminRoot 'package.json') -PathType Leaf)) {
    throw 'Missing provision.mjs, pack_runtime.py, or package.json. Extract the complete GG admin ZIP first.'
}

if ($env:OS -ne 'Windows_NT') {
    throw 'This helper needs Windows for its native JavaScript file picker.'
}

Add-Type -AssemblyName System.Windows.Forms

$node = Find-Executable @('node.exe')
$npm = Find-Executable @('npm.cmd')
$python = Find-Executable @('py.exe', 'python.exe', 'python3.exe')
$pythonPrefix = @()
if ([System.IO.Path]::GetFileName($python) -ieq 'py.exe') { $pythonPrefix = @('-3') }

$noname = Choose-JavaScript 'Select noname.js (GG 1.4.1)'
$game = Choose-JavaScript 'Select game.js (GG 1.0.41)'
Write-Host ('noname: ' + $noname)
Write-Host ('game:   ' + $game)
if ((Read-Host 'Upload exactly these two files? Type YES to continue') -cne 'YES') {
    throw 'Canceled. No files were uploaded.'
}

$bundleFolder = Join-Path $adminRoot ('.local\run-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $bundleFolder -Force | Out-Null

Push-Location -LiteralPath $adminRoot
try {
    Write-Host '[1/4] Installing official EdgeOne Blob SDK locally...'
    Run-Checked $npm @('install', '--no-package-lock', '--no-save', '--ignore-scripts', '--no-audit', '--no-fund')

    Write-Host '[2/4] Packing local JS; this bundle is not included in the APK...'
    $packArgs = $pythonPrefix + @('scripts\pack_runtime.py', '--noname', $noname,
        '--game', $game, '--version', $RuntimeVersion, '--out', $bundleFolder)
    Run-Checked $python $packArgs

    Write-Host '[3/4] Connecting to private Blob storage...'
    $secure = Read-Host 'Paste your EdgeOne Makers API Token (hidden input)' -AsSecureString
    if ($secure.Length -eq 0) { throw 'API Token cannot be empty.' }
    $credential = New-Object -TypeName System.Management.Automation.PSCredential -ArgumentList @('edgeone', $secure)
    $env:EDGEONE_PROJECT_ID = $ProjectId
    $env:EDGEONE_API_TOKEN = $credential.GetNetworkCredential().Password
    try {
        Run-Checked $node @('scripts\provision.mjs', 'upload', $bundleFolder)
        Write-Host '[4/4] Creating one 30-day test license...'
        Run-Checked $node @('scripts\provision.mjs', 'issue', '30')
    } finally {
        Remove-Item -Path Env:EDGEONE_API_TOKEN -ErrorAction SilentlyContinue
        Remove-Item -Path Env:EDGEONE_PROJECT_ID -ErrorAction SilentlyContinue
        $credential = $null
        $secure = $null
    }
} finally {
    Pop-Location
}

Write-Host 'Success. Copy the license key above and keep it private.' -ForegroundColor Green
Write-Host ('Private local bundle: ' + $bundleFolder)
Write-Host 'It may be deleted manually after successful device verification.'
Read-Host 'Press Enter when you have safely copied your license key' | Out-Null
