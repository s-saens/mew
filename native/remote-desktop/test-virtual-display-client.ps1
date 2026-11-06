$ErrorActionPreference = 'Stop'
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$vs = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vs) { throw 'Visual Studio C++ Build Tools and a Windows SDK are required for the CCD mock test.' }
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('mew-display-test-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporary | Out-Null
try {
  foreach ($file in @('virtual-display-client.test.cpp','virtual-display-client.h','virtual-display-protocol.h','virtual-display-modes.h')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $temporary $file)
  }
  $vcvars = Join-Path $vs 'VC\Auxiliary\Build\vcvarsall.bat'
  $compile = '@echo off' + "`r`n" + 'call "' + $vcvars + '" x64 >nul' + "`r`n" +
    'cl /nologo /std:c++17 /EHsc /O2 /MT virtual-display-client.test.cpp /link /OUT:display-test.exe setupapi.lib user32.lib' + "`r`n" + 'exit /b %errorlevel%'
  $script = Join-Path $temporary 'compile.cmd'
  [IO.File]::WriteAllText($script,$compile,[Text.Encoding]::Default)
  Push-Location -LiteralPath $temporary
  try {
    & $env:ComSpec /d /c $script
    if ($LASTEXITCODE -ne 0) { throw 'CCD mock test compilation failed.' }
    & (Join-Path $temporary 'display-test.exe')
    if ($LASTEXITCODE -ne 0) { throw 'CCD mock test assertions failed.' }
  } finally { Pop-Location }
  Write-Output 'Virtual display CCD mock tests passed. No displays or devices were modified.'
} finally { Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue }
