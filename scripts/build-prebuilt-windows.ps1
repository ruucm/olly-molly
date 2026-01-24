$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$OutDir = Join-Path $RootDir "dist/prebuilt"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
Set-Location $RootDir

Write-Host "Installing dependencies..."
npm install

Write-Host "Building Next.js..."
npm run build

# Find the actual standalone app directory (Next.js mirrors full path)
$ServerJs = Get-ChildItem -Path (Join-Path $RootDir ".next/standalone") -Recurse -Filter "server.js" |
    Where-Object { $_.FullName -notlike "*node_modules*" -and $_.FullName -like "*standalone*" } |
    Select-Object -First 1

if (-not $ServerJs) {
    Write-Error "Error: Could not find server.js in standalone output"
    exit 1
}

$StandaloneAppDir = $ServerJs.DirectoryName
Write-Host "Found standalone app at: $StandaloneAppDir"

# Copy static files to standalone app dir
$StandaloneStatic = Join-Path $StandaloneAppDir ".next/static"
if (Test-Path $StandaloneStatic) {
    Remove-Item -Recurse -Force $StandaloneStatic
}
New-Item -ItemType Directory -Force -Path (Split-Path $StandaloneStatic) | Out-Null
Copy-Item -Recurse -Force (Join-Path $RootDir ".next/static") $StandaloneStatic

# Copy public folder to standalone app dir
$StandalonePublic = Join-Path $StandaloneAppDir "public"
if (Test-Path $StandalonePublic) {
    Remove-Item -Recurse -Force $StandalonePublic
}
Copy-Item -Recurse -Force (Join-Path $RootDir "public") $StandalonePublic

$Version = node -p "require('./package.json').version"
$Tarball = Join-Path $OutDir "olly-molly-win32-x64.tar.gz"

# Create a clean tarball structure
$StagingDir = Join-Path $OutDir "staging"
if (Test-Path $StagingDir) {
    Remove-Item -Recurse -Force $StagingDir
}
$StagingStandalone = Join-Path $StagingDir ".next/standalone"
New-Item -ItemType Directory -Force -Path $StagingStandalone | Out-Null

# Copy standalone contents (flatten the nested path)
Copy-Item -Recurse -Force "$StandaloneAppDir/*" $StagingStandalone
# Also copy hidden .next folder
if (Test-Path (Join-Path $StandaloneAppDir ".next")) {
    Copy-Item -Recurse -Force (Join-Path $StandaloneAppDir ".next") (Join-Path $StagingStandalone ".next")
}
Copy-Item -Force (Join-Path $RootDir "package.json") $StagingDir

Write-Host "Packaging $Tarball..."
Push-Location $StagingDir
tar -czf $Tarball .
Pop-Location

Remove-Item -Recurse -Force $StagingDir
Write-Host "Done: $Tarball"
