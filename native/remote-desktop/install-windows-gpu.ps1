param([Parameter(Mandatory=$true)][string]$Target)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$targetPath = [IO.Path]::GetFullPath($Target)
$state = & (Join-Path $targetPath 'windows-build-environment.ps1') | ConvertFrom-Json
if (-not $state.tools.visualStudio) { throw 'Windows native desktop requires a matching Visual Studio C++ compiler environment and the Windows SDK.' }
$compiler = (Get-Command cl.exe -CommandType Application -ErrorAction Stop).Source
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('mew-gpu-check-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporary | Out-Null
try {
    $source = Join-Path $targetPath 'gpu-windows.cpp'
    $notification = Join-Path $targetPath 'notification-windows.cpp'
    if (-not (Test-Path -LiteralPath $source) -or -not (Test-Path -LiteralPath $notification)) { throw 'Windows native desktop source is missing.' }
    $library = Join-Path $temporary 'gpu-windows.dll'
    Push-Location -LiteralPath $temporary
    try {
        & $compiler /nologo /std:c++17 /utf-8 /EHsc /O2 /MT /LD /DUNICODE /D_UNICODE $source $notification /link "/OUT:$library" d3d11.lib dxgi.lib mfplat.lib mf.lib mfuuid.lib ole32.lib oleaut32.lib strmiids.lib user32.lib shell32.lib windowsapp.lib setupapi.lib
        if ($LASTEXITCODE -ne 0) { throw 'Windows GPU module compilation failed.' }
    }
    finally { Pop-Location }
    Move-Item -LiteralPath $library -Destination (Join-Path $targetPath 'gpu-windows.dll.tmp') -Force
    Move-Item -LiteralPath (Join-Path $targetPath 'gpu-windows.dll.tmp') -Destination (Join-Path $targetPath 'gpu-windows.dll') -Force
} finally { Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue }
