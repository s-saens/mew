$ErrorActionPreference = 'Stop'

function Get-MewReadyAddress([string]$Line) {
  $prefix = 'MEW_INSTALLER_READY '
  if (-not $Line.StartsWith($prefix, [StringComparison]::Ordinal)) { return $null }
  if ($Line.Length -gt 4096) { throw 'Mew returned an invalid local address.' }
  try { $message = $Line.Substring($prefix.Length) | ConvertFrom-Json; $uri = New-Object Uri([string]$message.url) }
  catch { throw 'Mew returned an invalid local address.' }
  if (-not $uri.IsAbsoluteUri -or $uri.Scheme -ne 'http' -or $uri.Host -notin @('127.0.0.1', 'localhost') -or $uri.Port -lt 1 -or $uri.Port -gt 65535 -or $uri.UserInfo -or $uri.AbsolutePath -ne '/' -or $uri.Query -or ($uri.Fragment -and $uri.Fragment -notmatch '^#setup=[A-Za-z0-9_-]{43}$')) {
    throw 'Mew returned an invalid local address.'
  }
  return $uri.AbsoluteUri
}

function Test-MewReopenError([string]$Line) {
  if (-not $Line.StartsWith('MEW_INSTALLER_ERROR ', [StringComparison]::Ordinal)) { return $false }
  try { return ($Line.Substring(20) | ConvertFrom-Json).code -eq 'reopen-failed' }
  catch { return $false }
}

function Get-MewLaunchRuntime($State, $Manifest) {
  if (-not $State -or $State.version -notmatch '^\d+\.\d+\.\d+$' -or $State.phase -notin @('ready', 'provisioning')) { throw 'Run Mew Setup to finish preparing the app. Your accounts and projects are preserved.' }
  if ($State.activeRuntimeSha -match '^[a-f0-9]{64}$' -and $State.activeNodeVersion -match '^\d+\.\d+\.\d+$') {
    return [pscustomobject]@{runtime=[pscustomobject]@{version=$State.version;sha256=$State.activeRuntimeSha};node=[pscustomobject]@{version=$State.activeNodeVersion}}
  }
  if ($State.phase -eq 'ready' -and $Manifest.runtime.version -eq $State.version) { return $Manifest }
  throw 'Run Mew Setup again to repair the installation. Existing accounts and projects are preserved.'
}

function Assert-MewObjectOwner($Object, [string]$Sid) {
  if ($Object.GetAccessControl().GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $Sid) { throw 'Mew could not verify its local launcher. Close other setup windows and try again.' }
}

function New-MewControllerMutex([string]$Name, [string]$Sid) {
  $security = New-Object Security.AccessControl.MutexSecurity
  $security.SetAccessRuleProtection($true, $false)
  $security.SetOwner((New-Object Security.Principal.SecurityIdentifier($Sid)))
  foreach ($identity in @((New-Object Security.Principal.SecurityIdentifier($Sid)), (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))) {
    $security.AddAccessRule((New-Object Security.AccessControl.MutexAccessRule($identity, 'FullControl', 'Allow')))
  }
  $created = $false
  $mutex = [Threading.Mutex]::new($false, "Global\$Name", [ref]$created, $security)
  try { Assert-MewObjectOwner $mutex $Sid; return $mutex }
  catch { $mutex.Dispose(); throw }
}

function New-MewOpenPipe([string]$Name, [string]$Sid) {
  $security = New-Object IO.Pipes.PipeSecurity
  $security.SetAccessRuleProtection($true, $false)
  $security.SetOwner((New-Object Security.Principal.SecurityIdentifier($Sid)))
  foreach ($identity in @((New-Object Security.Principal.SecurityIdentifier($Sid)), (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))) {
    $security.AddAccessRule((New-Object IO.Pipes.PipeAccessRule($identity, 'FullControl', 'Allow')))
  }
  $pipe = [IO.Pipes.NamedPipeServerStream]::new($Name, [IO.Pipes.PipeDirection]::InOut, 1, [IO.Pipes.PipeTransmissionMode]::Byte, [IO.Pipes.PipeOptions]::Asynchronous, 0, 0, $security)
  try { Assert-MewObjectOwner $pipe $Sid; return $pipe }
  catch { $pipe.Dispose(); throw }
}

function Request-MewOpen([string]$Name, [string]$Sid) {
  $rights = [IO.Pipes.PipeAccessRights]::ReadWrite -bor [IO.Pipes.PipeAccessRights]::ReadPermissions
  $client = [IO.Pipes.NamedPipeClientStream]::new('.', $Name, $rights, [IO.Pipes.PipeOptions]::Asynchronous, [Security.Principal.TokenImpersonationLevel]::Anonymous, [IO.HandleInheritability]::None)
  $reader = $null
  try {
    $client.Connect(5000); Assert-MewObjectOwner $client $Sid; $client.WriteByte(1); $client.Flush()
    $reader = [IO.StreamReader]::new($client, (New-Object Text.UTF8Encoding($false)), $false, 1024, $true)
    $response = $reader.ReadLineAsync()
    if (-not $response.Wait(90000)) { throw 'Mew is taking too long to open. Try the Mew shortcut again shortly.' }
    $line = $response.GetAwaiter().GetResult()
    if (Test-MewReopenError $line) { throw 'Mew could not reopen account setup. Repair or restore the existing Mew account data before trying again.' }
    $address = Get-MewReadyAddress $line
    if (-not $address) { throw 'Mew could not reopen. Try the Mew shortcut again.' }
    Start-Process -FilePath $address
    $address = $null; $line = $null
  }
  finally { if ($reader) { $reader.Dispose() }; $client.Dispose() }
}

function Close-MewOpenRequest($Pipe) {
  try { $Pipe.Disconnect() } catch [IO.IOException] { } catch [InvalidOperationException] { }
}

function Test-MewOpenRequest($Pipe) {
  try {
    $buffer = New-Object byte[] 1
    $read = $Pipe.ReadAsync($buffer, 0, 1)
    return $read.Wait(1000) -and $read.Result -eq 1 -and $buffer[0] -eq 1
  } catch [IO.IOException] { return $false }
  catch [AggregateException] { return $false }
  catch [InvalidOperationException] { return $false }
}

function Send-MewOpenReply($Pipe, [string]$Line) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($Line + "`n")
  try { $Pipe.Write($bytes, 0, $bytes.Length); $Pipe.Flush() }
  catch [IO.IOException] { } # A closed requesting shortcut must not stop Mew.
  finally { Close-MewOpenRequest $Pipe }
}

function Invoke-MewLaunch([string]$AppRoot) {
  . (Join-Path $AppRoot 'installer-core.ps1')
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $identity = Get-MewIdentity $sid
  $stateRoot = Join-Path $env:LOCALAPPDATA 'mew\windows-install'
  $state = Read-MewState (Join-Path $stateRoot 'installation.json') $sid $identity.Distro
  $manifest = Get-Content -LiteralPath (Join-Path $AppRoot 'install-manifest.json') -Raw | ConvertFrom-Json
  $active = Get-MewLaunchRuntime $state $manifest
  if (-not (Test-MewDistroPath (Get-MewDistroRegistration $identity.Distro) (Join-Path $stateRoot 'environment'))) { throw 'Mew could not verify its private environment. Run Setup again to repair it.' }
  $mutex = New-MewControllerMutex $identity.Pipe $sid
  $owned = $false
  $pipe = $null
  $process = $null
  $started = $false
  try {
    try { $owned = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $owned = $true }
    if (-not $owned) { Request-MewOpen $identity.Pipe $sid; return }
    $pipe = New-MewOpenPipe $identity.Pipe $sid
    $connection = $pipe.WaitForConnectionAsync()
    $wsl = Join-Path $env:SystemRoot 'System32\wsl.exe'
    $ownership = Invoke-MewNative $wsl @('--distribution', $identity.Distro, '--user', 'mew', '--exec', '/bin/cat', '/opt/mew/.installation-id')
    if ($ownership.Code -ne 0 -or $ownership.Output.Trim() -ne $state.installationId) { throw 'Mew could not verify ownership of its environment. Existing files have been preserved.' }
    if (-not (Test-MewInstalledRuntime $wsl $state $active $AppRoot)) { throw 'Mew could not verify its installed components. Run Setup again to repair the app. Your accounts and projects are preserved.' }
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $wsl
    $arguments = @('--distribution', $identity.Distro, '--user', 'mew', '--exec', '/bin/sh', "/opt/mew/versions/$($state.version)/launch.sh")
    $info.Arguments = (($arguments | ForEach-Object { ConvertTo-MewArgument $_ }) -join ' ')
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.RedirectStandardInput = $true
    $info.StandardOutputEncoding = New-Object Text.UTF8Encoding($false)
    $info.StandardErrorEncoding = New-Object Text.UTF8Encoding($false)
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    if (-not $process.Start()) { throw 'Mew could not open. Run Setup again to repair the app.' }
    $started = $true
    $stdout = $process.StandardOutput.ReadLineAsync()
    $stderr = $process.StandardError.ReadLineAsync()
    $opened = $false
    $pendingReply = $false
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $pendingAt = 0
    while (-not $process.HasExited) {
      if (-not $opened -and $timer.ElapsedMilliseconds -gt 180000) { throw 'Mew is taking too long to open. Try the Mew shortcut again shortly.' }
      if ($stdout -and $stdout.IsCompleted) {
        $line = $stdout.GetAwaiter().GetResult()
        if ($null -eq $line) { $stdout = $null }
        else {
          if (Test-MewReopenError $line) {
            if ($pendingReply) { Send-MewOpenReply $pipe $line; $pendingReply = $false; $connection = $pipe.WaitForConnectionAsync() }
          } else {
            $address = Get-MewReadyAddress $line
            if ($address) {
              if ($pendingReply) { Send-MewOpenReply $pipe $line; $pendingReply = $false; $connection = $pipe.WaitForConnectionAsync() }
              if (-not $opened) { Start-Process -FilePath $address }
              $opened = $true; $address = $null
            }
          }
          # Never write the readiness line or setup capability to a file or log.
          $line = $null
          $stdout = $process.StandardOutput.ReadLineAsync()
        }
      }
      if ($stderr -and $stderr.IsCompleted) {
        if ($null -eq $stderr.GetAwaiter().GetResult()) { $stderr = $null }
        else { $stderr = $process.StandardError.ReadLineAsync() }
      }
      if ($connection -and $connection.IsCompleted) {
        $connected = $false
        try { $connection.GetAwaiter().GetResult(); $connected = Test-MewOpenRequest $pipe }
        catch [IO.IOException] { }
        if ($connected) {
          # The CLI rotates an unfinished setup capability over its trusted host IPC.
          $pendingReply = $true; $pendingAt = $timer.ElapsedMilliseconds
          if ($opened) { $process.StandardInput.WriteLine('MEW_INSTALLER_OPEN'); $process.StandardInput.Flush() }
          $connection = $null
        } else {
          Close-MewOpenRequest $pipe
          $connection = $pipe.WaitForConnectionAsync()
        }
      }
      if ($pendingReply -and $timer.ElapsedMilliseconds - $pendingAt -gt 90000) {
        Send-MewOpenReply $pipe 'MEW_INSTALLER_ERROR {"code":"reopen-failed"}'
        $pendingReply = $false; $connection = $pipe.WaitForConnectionAsync()
      }
      Start-Sleep -Milliseconds 50
    }
    if (-not $opened -or $process.ExitCode -ne 0) { throw 'Mew could not open. Run Mew Setup again to repair the installation. Existing accounts and projects are preserved.' }
  } finally {
    if ($process) {
      if ($started -and -not $process.HasExited) {
        $process.StandardInput.Close()
        if (-not $process.WaitForExit(5000)) { $process.Kill() }
      }
      $process.Dispose()
    }
    if ($pipe) { $pipe.Dispose() }
    if ($owned) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
  }
}
