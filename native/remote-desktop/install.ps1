param([string]$Target = (Join-Path $env:LOCALAPPDATA 'Mew\remote-desktop'))
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $target | Out-Null
. (Join-Path $PSScriptRoot 'windows-runtime.ps1')
$node = Get-MewDesktopNode -Target $target -PrivateOnly
$env:PATH = (Split-Path -Parent $node) + ';' + $env:PATH
# Keep extraction and native verification on the Windows drive.
Push-Location -LiteralPath $target
try {
  Write-Output '[1/2] Preparing prebuilt Windows desktop components...'
  & $node (Join-Path $PSScriptRoot 'install-windows-native.mjs') --target $target
  if ($LASTEXITCODE -ne 0) { throw 'Windows desktop package preparation failed. Check the setup details above.' }
  Write-Output '[2/2] Preparing Windows UDP access for external desktop connections...'
  & (Join-Path $PSHOME 'powershell.exe') -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $target 'prepare-windows-network.ps1') -Target $target
  if ($LASTEXITCODE -ne 0) { Write-Warning 'Desktop files are ready, but Windows UDP access is not prepared. Run desktop-setup again to approve it.' }
  & $node (Join-Path $target 'helper-version.mjs') mark
  $result = $LASTEXITCODE
} finally { Pop-Location }
if ($result -ne 0) { exit $result }
