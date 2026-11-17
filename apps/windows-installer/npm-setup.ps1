param([Parameter(Mandatory=$true)][string]$AppRoot, [ValidateSet('prepare','launch','resume','stop','status','disable-autostart')][string]$Action = 'resume', [switch]$NoAutostart)
$ErrorActionPreference = 'Stop'
. (Join-Path $AppRoot 'installer-core.ps1')
. (Join-Path $AppRoot 'launcher-core.ps1')
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$identity = Get-MewIdentity $sid
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$script = Join-Path $AppRoot 'npm-setup.ps1'

function Register-MewLogin {
  $arguments = (@('-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',$script,'-AppRoot',$AppRoot,'-Action','launch') | ForEach-Object { ConvertTo-MewArgument $_ }) -join ' '
  $taskAction = New-ScheduledTaskAction -Execute $powershell -Argument $arguments
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $sid
  $principal = New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
  Register-ScheduledTask -TaskName $identity.Pipe -Action $taskAction -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
}

try {
  if ($Action -eq 'disable-autostart') {
    Unregister-ScheduledTask -TaskName $identity.Pipe -Confirm:$false -ErrorAction SilentlyContinue
    exit 0
  }
  if ($Action -eq 'status') {
    $mutex = New-MewControllerMutex $identity.Pipe $sid
    $owned = $false
    try {
      try { $owned = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $owned = $true }
      if ($owned) { Write-Output 'Mew is stopped.' } else { Write-Output 'Mew is running.' }
    } finally { if ($owned) { $mutex.ReleaseMutex() }; $mutex.Dispose() }
    exit 0
  }
  if ($Action -eq 'stop') { Request-MewStop $identity.Pipe $sid; exit 0 }
  if ($Action -in @('prepare','resume')) {
    $resumeArgs = @('-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',$script,'-AppRoot',$AppRoot,'-Action','resume')
    if ($NoAutostart) { $resumeArgs += '-NoAutostart' }
    $code = Invoke-MewSetup -AppRoot $AppRoot -ResumeExecutable $powershell -ResumeArguments $resumeArgs
    if ($code -ne 0) { exit $code }
    if (-not $NoAutostart) { Register-MewLogin }
    if ($Action -eq 'prepare') { exit 0 }
  }
  Invoke-MewLaunch $AppRoot
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
