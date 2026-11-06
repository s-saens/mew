$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$architecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
$cargoHome = if ($env:CARGO_HOME) { $env:CARGO_HOME } else { Join-Path $env:USERPROFILE '.cargo' }
$paths = @(
  (Join-Path $cargoHome 'bin'),
  (Join-Path $env:ProgramFiles 'CMake\bin'),
  (Join-Path $env:ProgramFiles 'LLVM\bin'),
  (Join-Path $env:SystemDrive 'Strawberry\perl\bin')
)
# Existing private Node and custom paths remain available. Registry paths pick
# up tools installed after the Mew/WSL process started, without a global write.
$env:PATH = (@($env:PATH) + $paths + @([Environment]::GetEnvironmentVariable('Path', 'Machine'), [Environment]::GetEnvironmentVariable('Path', 'User'))) -join ';'
$env:PATH = [Environment]::ExpandEnvironmentVariables($env:PATH)

function Find-MewBuildCommand([string]$Name) {
  $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($command) { return $command.Source }
  return $null
}

function Test-MewCompilerEnvironment {
  $compilerArchitecture = $env:VSCMD_ARG_TGT_ARCH
  if ($compilerArchitecture -eq 'amd64') { $compilerArchitecture = 'x64' }
  if ($compilerArchitecture -and $compilerArchitecture -ne $architecture) { return $false }
  $headers = @($env:INCLUDE -split ';' | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ 'Windows.h')) })
  $ucrt = @($env:INCLUDE -split ';' | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ 'stdio.h')) -and $_.TrimEnd('\', '/') -match '[\\/]ucrt$' })
  return [bool]((Find-MewBuildCommand 'cl.exe') -and (Find-MewBuildCommand 'link.exe') -and (Find-MewBuildCommand 'rc.exe') -and $headers.Count -and $ucrt.Count)
}

$compilerVariables = 'Path INCLUDE LIB LIBPATH VCINSTALLDIR VCToolsInstallDir VSINSTALLDIR VisualStudioVersion WindowsSdkDir WindowsSDKVersion WindowsSdkBinPath WindowsSdkVerBinPath UniversalCRTSdkDir UCRTVersion ExtensionSdkDir VSCMD_ARG_TGT_ARCH VSCMD_ARG_HOST_ARCH VSCMD_VER' -split ' '
$environment = @{}
$visualStudio = Test-MewCompilerEnvironment
$buildToolsPath = $null
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (Test-Path -LiteralPath $vswhere) {
  $buildToolsPath = & $vswhere -latest -products Microsoft.VisualStudio.Product.BuildTools -version '[17.0,18.0)' -property installationPath
  $installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  if (-not $visualStudio -and $LASTEXITCODE -eq 0 -and $installation) {
    $devcmd = Join-Path $installation 'Common7\Tools\VsDevCmd.bat'
    if (Test-Path -LiteralPath $devcmd) {
      # Capture only compiler/SDK variables, never serialize the full host env.
      Push-Location -LiteralPath $env:TEMP
      try { $lines = & $env:ComSpec /d /c "call `"$devcmd`" -no_logo -arch=$architecture -host_arch=x64 >nul && set" }
      finally { Pop-Location }
      if ($LASTEXITCODE -eq 0) {
        foreach ($line in $lines) {
          if ($line -match '^([^=]+)=(.*)$' -and $compilerVariables -contains $Matches[1]) {
            $environment[$Matches[1]] = $Matches[2]
            [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
          }
        }
        $visualStudio = Test-MewCompilerEnvironment
      }
    }
  }
}

if ($visualStudio) {
  foreach ($name in $compilerVariables) {
    $value = [Environment]::GetEnvironmentVariable($name, 'Process')
    if ($value) { $environment[$name] = $value }
  }
}

$clang = $null
$clangCommand = Find-MewBuildCommand 'clang.exe'
$clangPaths = @($env:LIBCLANG_PATH, (Join-Path $env:ProgramFiles 'LLVM\bin'))
if ($clangCommand) { $clangPaths += Split-Path -Parent $clangCommand }
foreach ($candidate in $clangPaths) {
  if (-not $candidate) { continue }
  $library = if ($candidate.EndsWith('.dll', [StringComparison]::OrdinalIgnoreCase)) { $candidate } else { Join-Path $candidate 'libclang.dll' }
  if (Test-Path -LiteralPath $library) { $clang = Split-Path -Parent $library; break }
}
if ($clang) { $environment['LIBCLANG_PATH'] = $clang }
$environment['Path'] = $env:PATH
$rustup = Find-MewBuildCommand 'rustup.exe'
if (-not (Find-MewBuildCommand 'cargo.exe')) { $rustup = $null }
$winget = Find-MewBuildCommand 'winget.exe'
if (-not $winget) {
  $alias = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\winget.exe'
  if (Test-Path -LiteralPath $alias) { $winget = $alias }
}
@{
  architecture = $architecture
  buildToolsPath = $buildToolsPath
  environment = $environment
  winget = $winget
  tools = @{ visualStudio = $visualStudio; cmake = (Find-MewBuildCommand 'cmake.exe'); clang = $clang; perl = (Find-MewBuildCommand 'perl.exe'); rust = $rustup }
} | ConvertTo-Json -Depth 4 -Compress
