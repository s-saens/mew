param([Parameter(Mandatory=$true)][string]$AppRoot, [Parameter(Mandatory=$true)][string]$ResumeExecutable)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'installer-core.ps1')
try { exit (Invoke-MewSetup -AppRoot $AppRoot -ResumeExecutable $ResumeExecutable) }
catch {
  [IO.File]::WriteAllText((Join-Path $AppRoot 'setup-error.txt'), $_.Exception.Message, (New-Object Text.UTF8Encoding($false)))
  exit 1
}
