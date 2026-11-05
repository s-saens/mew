$ErrorActionPreference = 'Stop'

function Get-MewIdentity([string]$Sid) {
  $hash = [Security.Cryptography.SHA256]::Create()
  try { $suffix = ([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($Sid)))).Replace('-', '').ToLowerInvariant().Substring(0, 12) }
  finally { $hash.Dispose() }
  return @{ Distro = "Mew-$suffix"; ResumeName = "MewSetupResume-$suffix"; Pipe = "mew-open-$suffix" }
}

function ConvertTo-MewArgument([string]$Value) {
  # Windows CommandLineToArgvW quoting, including trailing backslashes.
  return '"' + ([regex]::Replace([regex]::Replace($Value, '(\\*)"', '$1$1\"'), '(\\+)$', '$1$1')) + '"'
}

function Invoke-MewNative([string]$File, [string[]]$Arguments, [int]$Timeout = 120000) {
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = $File
  $info.Arguments = (($Arguments | ForEach-Object { ConvertTo-MewArgument $_ }) -join ' ')
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $info.StandardOutputEncoding = New-Object Text.UTF8Encoding($false)
  $info.StandardErrorEncoding = New-Object Text.UTF8Encoding($false)
  $process = New-Object Diagnostics.Process
  $process.StartInfo = $info
  try {
    if (-not $process.Start()) { throw 'Could not start a setup operation.' }
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit($Timeout)) { $process.Kill(); throw 'A setup operation timed out. Your existing data has been preserved.' }
    return @{ Code = $process.ExitCode; Output = $stdout.GetAwaiter().GetResult(); Error = $stderr.GetAwaiter().GetResult() }
  } finally { $process.Dispose() }
}

function Protect-MewDirectory([string]$Directory) {
  [IO.Directory]::CreateDirectory($Directory) | Out-Null
  $item = Get-Item -LiteralPath $Directory -Force
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'The Mew installation state must be a regular folder.' }
  $acl = New-Object Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true, $false)
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl.SetOwner($sid)
  foreach ($identity in @($sid, (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))) {
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
  }
  Set-Acl -LiteralPath $Directory -AclObject $acl
}

function Write-MewState([string]$Path, $State) {
  $temporary = "$Path.$([Guid]::NewGuid().ToString('N')).tmp"
  try {
    [IO.File]::WriteAllText($temporary, ($State | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $temporary -Destination $Path -Force
  } finally { Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue }
}

function Read-MewState([string]$Path, [string]$Sid, [string]$Distro) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  $state = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  if ($state.format -ne 1 -or $state.ownerSid -ne $Sid -or $state.distro -ne $Distro -or $state.installationId -notmatch '^[a-f0-9]{32}$' -or $state.phase -notin @('pending', 'reboot', 'importing', 'provisioning', 'ready')) {
    throw 'The existing Mew installation could not be identified safely. Its data has been preserved.'
  }
  return $state
}

function Get-MewSetupPlan($State, [bool]$WslReady, [bool]$HasDistro, [bool]$OwnsDistro, [string]$Version, [string]$Architecture = 'AMD64') {
  if ($Architecture -ne 'AMD64') { throw 'This Mew installer supports Windows x64. An ARM64 installer is not available yet.' }
  if ($HasDistro -and (-not $State -or -not $OwnsDistro)) { throw 'An existing environment has the same name. Mew will not change it.' }
  if (-not $HasDistro -and $State.version) { throw 'Mew could not find its existing environment. Restore its installation data before running Setup again.' }
  if (-not $WslReady) { return @('prepare-windows') }
  if (-not $HasDistro) { return @('download-rootfs', 'import-distro', 'provision') }
  if ($State.phase -eq 'ready' -and $State.version -eq $Version) { return @('verify') }
  return @('provision')
}

function Get-MewDistroRegistration([string]$Name) {
  foreach ($key in @(Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss' -ErrorAction SilentlyContinue)) {
    $value = Get-ItemProperty -LiteralPath $key.PSPath
    if ($value.DistributionName -eq $Name) { return $value }
  }
  return $null
}

function Test-MewDistroPath($Registration, [string]$Expected) {
  if (-not $Registration) { return $false }
  $actual = [Environment]::ExpandEnvironmentVariables([string]$Registration.BasePath)
  if ($actual.StartsWith('\\?\')) { $actual = $actual.Substring(4) }
  return [IO.Path]::GetFullPath($actual).TrimEnd('\').Equals([IO.Path]::GetFullPath($Expected).TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)
}

function Get-MewDownload($Item, [string]$Cache, [string]$Extension) {
  if ($Item.sha256 -notmatch '^[a-f0-9]{64}$' -or $Item.url -notmatch '^https://') { throw 'The embedded download identity is invalid.' }
  [IO.Directory]::CreateDirectory($Cache) | Out-Null
  $destination = Join-Path $Cache ($Item.sha256 + $Extension)
  if ((Test-Path -LiteralPath $destination) -and (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -eq $Item.sha256) { return $destination }
  $temporary = "$destination.$([Guid]::NewGuid().ToString('N')).part"
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -UseBasicParsing -Uri $Item.url -OutFile $temporary -TimeoutSec 1200
    if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Item.sha256) { throw 'A downloaded Mew component failed its integrity check. Run Setup again to retry.' }
    Move-Item -LiteralPath $temporary -Destination $destination -Force
    return $destination
  } finally { Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue }
}

function Set-MewResume([string]$Name, [string]$Executable) {
  $key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce'
  New-Item -Path $key -Force | Out-Null
  Set-ItemProperty -LiteralPath $key -Name $Name -Value (ConvertTo-MewArgument $Executable)
}

function Remove-MewResume([string]$Name) {
  Remove-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce' -Name $Name -ErrorAction SilentlyContinue
}

function Get-MewBootStamp { return (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().Ticks.ToString() }

function Test-MewWindowsFeaturesReady {
  try {
    $feature = Get-CimInstance Win32_OptionalFeature -Filter "Name='VirtualMachinePlatform'"
    $computer = Get-CimInstance Win32_ComputerSystem
    return $feature.InstallState -eq 1 -and [bool]$computer.HypervisorPresent
  } catch { throw 'Mew could not inspect the required Windows components. Check Windows updates or your organization policy, then retry Setup.' }
}

function Test-MewWindowsReady([string]$Wsl) {
  return (Invoke-MewNative $Wsl @('--status')).Code -eq 0 -and (Test-MewWindowsFeaturesReady)
}

function Test-MewInstalledRuntime([string]$Wsl, $State, $Manifest, [string]$AppRoot) {
  $converted = Invoke-MewNative $Wsl @('--distribution', $State.distro, '--user', 'root', '--exec', 'wslpath', '-a', '-u', (Join-Path $AppRoot 'verify-linux.sh'))
  if ($converted.Code -ne 0) { return $false }
  $result = Invoke-MewNative $Wsl @('--distribution', $State.distro, '--user', 'mew', '--exec', '/bin/sh', $converted.Output.Trim(), $Manifest.runtime.version, $Manifest.runtime.sha256, $Manifest.node.version)
  return $result.Code -eq 0
}

function Enable-MewWindowsEnvironment([string]$Wsl, [string]$Stage) {
  # Only fixed Microsoft system operations run elevated, never user-writable scripts.
  if ($Stage -eq 'features') { $command = @'
$ErrorActionPreference = 'Stop'
$reboot = $false
foreach ($feature in @('Microsoft-Windows-Subsystem-Linux', 'VirtualMachinePlatform')) {
  & "$env:SystemRoot\System32\dism.exe" /online /enable-feature "/featurename:$feature" /all /norestart /quiet
  if ($LASTEXITCODE -eq 3010) { $reboot = $true } elseif ($LASTEXITCODE -ne 0) { exit 1 }
}
if ($reboot) { exit 3010 }
exit 0
'@
  } elseif ($Stage -eq 'wsl') { $command = @'
& "$env:SystemRoot\System32\wsl.exe" --install --no-distribution --web-download
exit $LASTEXITCODE
'@
  } else { throw 'The Windows preparation stage is invalid.' }
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
  $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $process = Start-Process -FilePath $powershell -Verb RunAs -ArgumentList "-NoProfile -NonInteractive -EncodedCommand $encoded" -Wait -PassThru
  if ($process.ExitCode -notin @(0, 3010, 1641)) { throw 'Windows preparation was cancelled or failed. Run Mew Setup again when you are ready.' }
}

function Invoke-MewSetup([string]$AppRoot, [string]$StateRoot, [string]$ResumeExecutable, [string]$Sid, [string]$Architecture, [string]$Wsl) {
  if (-not $StateRoot) { $StateRoot = Join-Path $env:LOCALAPPDATA 'mew\windows-install' }
  if (-not $Sid) { $Sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value }
  if (-not $Architecture) { $Architecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE } }
  if (-not $Wsl) { $Wsl = Join-Path $env:SystemRoot 'System32\wsl.exe' }
  $manifest = Get-Content -LiteralPath (Join-Path $AppRoot 'install-manifest.json') -Raw | ConvertFrom-Json
  if ($manifest.format -ne 1 -or $manifest.arch -ne 'x64' -or $manifest.runtime.version -notmatch '^\d+\.\d+\.\d+$') { throw 'The Mew installer manifest is invalid.' }
  $identity = Get-MewIdentity $Sid
  [void](Get-MewSetupPlan $null $true $false $false $manifest.runtime.version $Architecture)
  $stateFile = Join-Path $StateRoot 'installation.json'
  $distroDirectory = Join-Path $StateRoot 'environment'
  Protect-MewDirectory $StateRoot
  # Serializes setup retries without deleting stale locks or unrelated processes.
  $lock = [IO.File]::Open((Join-Path $StateRoot 'setup.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  try {
    $state = Read-MewState $stateFile $Sid $identity.Distro
    $registration = Get-MewDistroRegistration $identity.Distro
    $ready = Test-MewWindowsReady $Wsl
    $plan = @(Get-MewSetupPlan $state $ready ([bool]$registration) (Test-MewDistroPath $registration $distroDirectory) $manifest.runtime.version $Architecture)
    if (-not $state) { $state = [pscustomobject]@{ format = 1; ownerSid = $Sid; distro = $identity.Distro; installationId = [Guid]::NewGuid().ToString('N'); phase = 'pending'; version = ''; boot = ''; resumePhase = 'pending' } }
    if (-not $state.PSObject.Properties['resumePhase']) { $state | Add-Member NoteProperty resumePhase 'pending' }
    if (-not $state.PSObject.Properties['preparationStage']) { $state | Add-Member NoteProperty preparationStage '' }
    if ($ready -and $state.phase -eq 'reboot') {
      $state.phase = if ($state.resumePhase -in @('pending', 'importing', 'provisioning', 'ready')) { $state.resumePhase } else { 'pending' }
      $plan = @(Get-MewSetupPlan $state $ready ([bool]$registration) (Test-MewDistroPath $registration $distroDirectory) $manifest.runtime.version $Architecture)
    }
    Write-MewState $stateFile $state
    if ($plan -contains 'prepare-windows') {
      $boot = Get-MewBootStamp
      if ($state.phase -eq 'reboot') {
        if ($state.boot -eq $boot) {
          Set-MewResume $identity.ResumeName $ResumeExecutable
          return 3010
        }
        if ($state.preparationStage -ne 'features' -or -not (Test-MewWindowsFeaturesReady)) { throw 'Windows could not finish preparing Mew. Check hardware virtualization and Windows updates, then run Setup again. Your data is preserved.' }
      } else {
        $state.resumePhase = $state.phase
      }
      foreach ($stage in @('features', 'wsl')) {
        if ($stage -eq 'features' -and (Test-MewWindowsFeaturesReady)) { continue }
        Enable-MewWindowsEnvironment $Wsl $stage
        $state.phase = 'reboot'; $state.boot = $boot; $state.preparationStage = $stage
        Write-MewState $stateFile $state
        if (Test-MewWindowsReady $Wsl) { break }
        if ($stage -eq 'wsl' -or -not (Test-MewWindowsFeaturesReady)) {
          Set-MewResume $identity.ResumeName $ResumeExecutable
          return 3010
        }
      }
      $state.phase = $state.resumePhase
      Write-MewState $stateFile $state
      $plan = @(Get-MewSetupPlan $state $true ([bool]$registration) (Test-MewDistroPath $registration $distroDirectory) $manifest.runtime.version $Architecture)
    }
    if ($plan -contains 'import-distro') {
      if (Test-Path -LiteralPath $distroDirectory) {
        if ((Get-Item -LiteralPath $distroDirectory -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Mew could not verify its private environment folder. Existing files have been preserved.' }
        if (@(Get-ChildItem -LiteralPath $distroDirectory -Force).Count) {
          if ($state.phase -ne 'importing' -or $state.version) { throw 'An incomplete Mew environment needs recovery. Existing files have been preserved.' }
          Move-Item -LiteralPath $distroDirectory -Destination ($distroDirectory + '.incomplete-' + [Guid]::NewGuid().ToString('N'))
        }
      }
      $rootfs = Get-MewDownload $manifest.rootfs (Join-Path $StateRoot 'downloads') '.rootfs.tar.gz'
      $state.phase = 'importing'; Write-MewState $stateFile $state
      $import = Invoke-MewNative $Wsl @('--import', $identity.Distro, $distroDirectory, $rootfs, '--version', '2') 1200000
      if ($import.Code -ne 0) { throw 'Mew could not create its private environment. Existing Windows environments have not been changed.' }
      $registration = Get-MewDistroRegistration $identity.Distro
      if (-not (Test-MewDistroPath $registration $distroDirectory)) { throw 'The new Mew environment location could not be verified.' }
    }
    # A private registry location and journal are required before claiming an interrupted import.
    $claim = 'set -eu; id="$1"; test ! -L /opt/mew; test ! -L /opt/mew/.installation-id; if [ -e /opt/mew/.installation-id ]; then test "$(cat /opt/mew/.installation-id)" = "$id"; else test "$2" = importing; if [ -e /opt/mew ]; then test -d /opt/mew; test -z "$(ls -A /opt/mew)"; else mkdir /opt/mew; fi; tmp="/opt/.mew-installation-id-$id.tmp"; test ! -L "$tmp"; umask 022; printf %s "$id" > "$tmp"; chmod 644 "$tmp"; mv "$tmp" /opt/mew/.installation-id; fi'
    $ownership = Invoke-MewNative $Wsl @('--distribution', $identity.Distro, '--user', 'root', '--exec', '/bin/sh', '-c', $claim, 'mew-claim', $state.installationId, $state.phase)
    if ($ownership.Code -ne 0) { throw 'Mew could not verify ownership of its environment. Its files were not replaced.' }
    if ($plan -contains 'verify' -and -not (Test-MewInstalledRuntime $Wsl $state $manifest $AppRoot)) { $plan = @('provision') }
    if ($plan -notcontains 'verify') {
      $state.phase = 'provisioning'; Write-MewState $stateFile $state
      $cache = Join-Path $StateRoot 'downloads'
      $node = Get-MewDownload $manifest.node $cache '.node.tar.xz'
      $runtime = Get-MewDownload $manifest.runtime $cache '.runtime.tar.gz'
      $paths = @()
      foreach ($file in @((Join-Path $AppRoot 'bootstrap-linux.sh'), $node, $runtime, $AppRoot)) {
        $converted = Invoke-MewNative $Wsl @('--distribution', $identity.Distro, '--user', 'root', '--exec', 'wslpath', '-a', '-u', $file)
        if ($converted.Code -ne 0) { throw 'Mew could not access its installation files.' }
        $paths += $converted.Output.Trim()
      }
      $result = Invoke-MewNative $Wsl @('--distribution', $identity.Distro, '--user', 'root', '--exec', '/bin/sh', $paths[0], $state.installationId, $manifest.runtime.version, $paths[1], $paths[2], $paths[3], $manifest.runtime.sha256, $manifest.node.sha256, $manifest.node.version) 3600000
      if ($result.Code -ne 0) { throw 'Mew could not finish preparing its components. Check your connection and run Setup again; your accounts and projects are preserved.' }
    }
    if (-not (Test-MewInstalledRuntime $Wsl $state $manifest $AppRoot)) { throw 'Mew installation verification did not complete. Run Setup again.' }
    $state.phase = 'ready'; $state.version = $manifest.runtime.version; $state.boot = ''
    $state | Add-Member NoteProperty activeRuntimeSha $manifest.runtime.sha256 -Force
    $state | Add-Member NoteProperty activeNodeVersion $manifest.node.version -Force
    Write-MewState $stateFile $state
    Remove-MewResume $identity.ResumeName
    return 0
  } finally { $lock.Dispose() }
}
