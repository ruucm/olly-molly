$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$OutDir = Join-Path $RootDir "dist/prebuilt"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
Set-Location $RootDir

Write-Host "Installing dependencies..."
npm install

Write-Host "Building Next.js..."
npm run build

$StandaloneStatic = Join-Path $RootDir ".next/standalone/.next/static"
if (Test-Path $StandaloneStatic) {
  Remove-Item -Recurse -Force $StandaloneStatic
}
New-Item -ItemType Directory -Force -Path (Split-Path $StandaloneStatic) | Out-Null
Copy-Item -Recurse -Force (Join-Path $RootDir ".next/static") $StandaloneStatic

$Version = node -p "require('./package.json').version"
$Tarball = Join-Path $OutDir "olly-molly-win32-x64.tar.gz"

Write-Host "Packaging $Tarball..."
tar -czf $Tarball `
  .next/standalone `
  package.json `
  public

Write-Host "Done: $Tarball"
