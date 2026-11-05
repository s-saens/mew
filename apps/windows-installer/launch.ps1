param([string]$AppRoot = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'launcher-core.ps1')
try { Invoke-MewLaunch $AppRoot }
catch {
  Add-Type -AssemblyName PresentationFramework
  [void][Windows.MessageBox]::Show($_.Exception.Message, 'Mew', 'OK', 'Error')
  exit 1
}
