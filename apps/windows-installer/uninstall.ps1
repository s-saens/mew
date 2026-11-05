param([string]$AppRoot = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'installer-core.ps1')
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$identity = Get-MewIdentity $sid
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce'
$current = (Get-ItemProperty -LiteralPath $key -Name $identity.ResumeName -ErrorAction SilentlyContinue).($identity.ResumeName)
if ($current -eq (ConvertTo-MewArgument (Join-Path $AppRoot 'MewSetup.exe'))) { Remove-MewResume $identity.ResumeName }
# Uninstalling shortcuts and launcher files never unregisters the private
# environment, removes accounts/projects, or stops an existing app process.
