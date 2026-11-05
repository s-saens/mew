import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { buildWindowsInstaller, createInstallerManifest } from './build.mjs'

const source = path.dirname(fileURLToPath(import.meta.url))
const downloads = JSON.parse(await fs.readFile(path.join(source, 'downloads.json'), 'utf8'))
const hash = 'a'.repeat(64)
const sums = `${hash}  mew-runtime-linux-x64.tar.gz\n`
const manifest = createInstallerManifest('1.2.3', sums, downloads)
const temporary = async callback => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-installer-test-'))
  try { return await callback(directory) } finally { await fs.rm(directory, { recursive: true, force: true }) }
}

test('release manifest binds stable runtime and prerequisite identities', () => {
  assert.equal(manifest.runtime.sha256, hash)
  assert.match(manifest.runtime.url, /mew-cli-v1\.2\.3\/mew-runtime-linux-x64\.tar\.gz$/)
  for (const version of ['latest', '1.2.3-beta.1', '../1.2.3']) assert.throws(() => createInstallerManifest(version, sums, downloads))
  for (const checksums of ['', sums + sums, sums.replace(hash, 'invalid')]) assert.throws(() => createInstallerManifest('1.2.3', checksums, downloads))
  assert.throws(() => createInstallerManifest('1.2.3', sums, { ...downloads, node: { ...downloads.node, url: 'http://unsafe.test/node' } }))
})

test('packager stages pinned payload and LF shell sources, runs only isolated npm and compiler', async () => temporary(async root => {
  await fs.cp(source, path.join(root, 'apps/windows-installer'), { recursive: true })
  const cli = path.join(root, 'apps/cli')
  await fs.mkdir(path.join(cli, 'bin'), { recursive: true }); await fs.mkdir(path.join(cli, 'src'))
  for (const [file, contents] of Object.entries({ 'package.json': JSON.stringify({ version: '1.2.3' }), 'package-lock.json': '{}', LICENSE: 'CLI license', 'bin/mew.mjs': '// entry', 'src/index.mjs': '// CLI' })) await fs.writeFile(path.join(cli, file), contents)
  await fs.writeFile(path.join(root, 'LICENSE'), 'Mew license')
  const output = path.join(root, 'artifacts'), commands = []
  let staged
  const executable = await buildWindowsInstaller({ root, output, platform: 'win32', compiler: 'mock-iscc', node: 'mock-node', npmCli: 'mock-npm',
    fetchImpl: async url => { assert.match(url, /mew-cli-v1\.2\.3\/SHA256SUMS$/); return { ok: true, text: async () => sums } },
    run(command, args) {
      commands.push([command, args])
      if (command === 'mock-node') {
        assert.deepEqual(args.slice(0, 3), ['mock-npm', 'ci', '--prefix'])
        assert.ok(args.includes('--ignore-scripts')); assert.ok(args.includes('--omit=dev'))
        staged = path.dirname(args[3])
      } else {
        assert.equal(command, 'mock-iscc')
        assert.ok(args.includes(`/DPayload=${staged}`))
        assert.deepEqual(JSON.parse(readFileSync(path.join(staged, 'install-manifest.json'), 'utf8')), manifest)
        for (const file of ['bootstrap-linux.sh', 'launch-linux.sh', 'verify-linux.sh']) assert.equal(readFileSync(path.join(staged, file)).includes(13), false, `emitted ${file} must use LF`)
        execFileSync(process.execPath, ['-e', 'require("fs").writeFileSync(process.argv[1], "unsigned mock installer")', path.join(output, 'mew-windows-setup-x64.exe')])
      }
      return { status: 0 }
    },
  })
  assert.equal(commands.length, 2)
  assert.equal(await fs.readFile(`${executable}.sha256`, 'utf8'), `${createHash('sha256').update('unsigned mock installer').digest('hex')}  mew-windows-setup-x64.exe\n`)
  assert.equal(existsSync(staged), false, 'isolated staging must be cleaned')
  for (const file of ['bootstrap-linux.sh', 'launch-linux.sh', 'verify-linux.sh']) assert.equal((await fs.readFile(path.join(source, file))).includes(13), false)
  await assert.rejects(buildWindowsInstaller({ platform: 'linux', output }), /Windows release runner/)
  await assert.rejects(buildWindowsInstaller({ root, output, platform: 'win32', fetchImpl: async () => ({ ok: false }), run() { assert.fail('must not install or compile without release identity') } }), /matching immutable CLI runtime/)
}))

test('shell payloads parse without execution', { skip: process.platform === 'win32' }, () => {
  for (const file of ['bootstrap-linux.sh', 'launch-linux.sh', 'verify-linux.sh']) {
    const result = spawnSync('/bin/sh', ['-n', path.join(source, file)], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  }
})

test('runtime verification rejects missing executables, stale marker and legacy owner setup', { skip: process.platform !== 'linux' }, async () => temporary(async base => {
  const runtime = path.join(base, 'runtimes/1.2.3-linux-x64-node24')
  for (const folder of ['node/bin', 'cli/bin', 'cli/src', 'runtimes/1.2.3-linux-x64-node24/server', 'runtimes/1.2.3-linux-x64-node24/bin', 'runtimes/1.2.3-linux-x64-node24/dist']) await fs.mkdir(path.join(base, folder), { recursive: true })
  await fs.symlink(process.execPath, path.join(base, 'node/bin/node'))
  for (const file of ['launch.sh', 'cli/bin/mew.mjs', 'runtimes/1.2.3-linux-x64-node24/dist/index.html', '.complete', 'runtimes/1.2.3-linux-x64-node24/server/cli-host.js', 'runtimes/1.2.3-linux-x64-node24/server/browser-dependencies.js', 'runtimes/1.2.3-linux-x64-node24/server/first-owner-setup.js', 'runtimes/1.2.3-linux-x64-node24/server/account-storage.js', 'runtimes/1.2.3-linux-x64-node24/bin/tmux']) await fs.writeFile(path.join(base, file), file === '.complete' ? hash : '// original fixture\n')
  await fs.writeFile(path.join(base, 'cli/bin/mew.mjs'), "import '../src/version-fixture.mjs'\n")
  await fs.writeFile(path.join(base, 'cli/src/version-fixture.mjs'), "console.log('1.2.3')\n")
  await fs.chmod(path.join(runtime, 'bin/tmux'), 0o755)
  await fs.writeFile(path.join(runtime, 'mew-runtime.json'), JSON.stringify({ version: '1.2.3', platform: 'linux', arch: 'x64', nodeMajor: 24, entrypoint: 'server/cli-host.js', browserDependencies: 'server/browser-dependencies.js' }))
  await fs.writeFile(path.join(base, 'cli/package.json'), JSON.stringify({ version: '1.2.3' }))
  const records = []
  async function record(directory) {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name)
      if (item.isDirectory()) await record(file)
      else if (item.isFile()) records.push(`${createHash('sha256').update(await fs.readFile(file)).digest('hex')}  ./${path.relative(base, file)}\n`)
    }
  }
  await record(base)
  await fs.writeFile(path.join(base, '.integrity.sha256'), records.join(''))
  const verify = () => spawnSync('/bin/sh', [path.join(source, 'verify-linux.sh'), '1.2.3', hash, process.versions.node, base], { encoding: 'utf8' })
  assert.equal(verify().status, 0)
  for (const file of ['node/bin/node', 'cli/bin/mew.mjs', 'cli/src/version-fixture.mjs', 'runtimes/1.2.3-linux-x64-node24/server/cli-host.js', 'runtimes/1.2.3-linux-x64-node24/server/first-owner-setup.js', 'runtimes/1.2.3-linux-x64-node24/dist/index.html']) {
    await fs.rename(path.join(base, file), path.join(base, `${file}.saved`)); assert.notEqual(verify().status, 0, file); await fs.rename(path.join(base, `${file}.saved`), path.join(base, file))
  }
  const host = path.join(runtime, 'server/cli-host.js')
  const original = await fs.readFile(host)
  await fs.truncate(host, 0); assert.notEqual(verify().status, 0, 'readable truncated host must fail integrity'); await fs.writeFile(host, original)
  await fs.writeFile(path.join(base, '.complete'), 'wrong'); assert.notEqual(verify().status, 0)
}))

const powershell = process.platform === 'win32' ? path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe') : '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
const windowsPath = file => process.platform === 'win32' ? file : execFileSync('wslpath', ['-w', file], { encoding: 'utf8' }).trim()
const psLiteral = value => `'${value.replaceAll("'", "''")}'`
function runPowerShell(script) {
  const result = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(`$ErrorActionPreference='Stop'\n${script}`, 'utf16le').toString('base64')], { encoding: 'utf8', timeout: 120_000 })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
}

test('Windows PowerShell 5.1 parses every script without invoking entrypoints', { skip: !existsSync(powershell) }, () => {
  runPowerShell(`
    Get-ChildItem -LiteralPath ${psLiteral(windowsPath(source))} -Filter *.ps1 | ForEach-Object {
      $tokens=$null; $errors=$null
      [void][Management.Automation.Language.Parser]::ParseFile($_.FullName,[ref]$tokens,[ref]$errors)
      if ($errors.Count) { throw ($errors | Out-String) }
    }
  `)
})

test('Windows pure planning, WSL1 readiness, URL and disconnected-request regressions', { skip: !existsSync(powershell) }, () => {
  runPowerShell(`
    . ([ScriptBlock]::Create([IO.File]::ReadAllText(${psLiteral(windowsPath(path.join(source, 'installer-core.ps1')))})))
    . ([ScriptBlock]::Create([IO.File]::ReadAllText(${psLiteral(windowsPath(path.join(source, 'launcher-core.ps1')))})))
    function Assert($condition, $message) { if (-not $condition) { throw $message } }
    function Reject($operation) { $failed=$false; try { & $operation } catch { $failed=$true }; Assert $failed 'Expected rejection' }
    $ready=[pscustomobject]@{phase='ready';version='1.2.3'}
    Assert ((Get-MewSetupPlan $null $true $false $false '1.2.3') -contains 'import-distro') 'fresh import'
    Assert ((Get-MewSetupPlan $ready $true $true $true '1.2.3') -contains 'verify') 'ready verify'
    Assert ((Get-MewSetupPlan $ready $false $true $true '1.2.3') -contains 'prepare-windows') 'prepare first'
    Reject { Get-MewSetupPlan $null $true $false $false '1.2.3' ARM64 }
    Reject { Get-MewSetupPlan $null $true $true $false '1.2.3' }
    Reject { Get-MewSetupPlan $ready $true $false $false '1.2.3' }
    function Invoke-MewNative { return @{Code=0} }
    function Get-CimInstance($ClassName) { if ($ClassName -eq 'Win32_OptionalFeature') { return @{InstallState=2} }; return @{HypervisorPresent=$true} }
    Assert (-not (Test-MewWindowsReady ignored)) 'WSL1 status success does not prove WSL2 readiness'
    $token='A'*43
    $line='MEW_INSTALLER_READY '+(@{url="http://127.0.0.1:1234/#setup=$token"}|ConvertTo-Json -Compress)
    Assert ((Get-MewReadyAddress $line) -eq "http://127.0.0.1:1234/#setup=$token") 'valid address'
    foreach ($url in @('https://127.0.0.1:1/','http://example.test/','http://127.0.0.1:1/?token=x','http://user@localhost:1/', 'http://localhost:1/#setup=short', 'http://localhost:1/private')) { Reject { Get-MewReadyAddress ('MEW_INSTALLER_READY '+(@{url=$url}|ConvertTo-Json -Compress)) } }
    Assert (Test-MewReopenError 'MEW_INSTALLER_ERROR {"code":"reopen-failed"}') 'structured safe error'
    Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
public class MewClosedRequestFixture : MemoryStream {
  public bool Closed;
  public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellation) {
    var result = new TaskCompletionSource<int>(); result.SetException(new IOException("closed requester")); return result.Task;
  }
  public override void Write(byte[] buffer, int offset, int count) { throw new IOException("closed requester"); }
  public override void Flush() { throw new IOException("closed requester"); }
  public void Disconnect() { Closed=true; throw new IOException("already closed"); }
}
'@
    $fake=[MewClosedRequestFixture]::new()
    Assert (-not (Test-MewOpenRequest $fake)) 'closed requester is contained'
    Send-MewOpenReply $fake 'MEW_INSTALLER_ERROR {"code":"reopen-failed"}'
    Assert $fake.Closed 'closed requester cleanup is contained'
    $next=[IO.MemoryStream]::new()
    $next|Add-Member ScriptMethod Disconnect { }
    Send-MewOpenReply $next 'next safe response'
    Assert ([Text.Encoding]::UTF8.GetString($next.ToArray()) -eq "next safe response\n") 'next requester still works'
    $next.Dispose()
    $owner=[pscustomobject]@{}
    $owner|Add-Member ScriptMethod GetAccessControl { $acl=[pscustomobject]@{}; $acl|Add-Member ScriptMethod GetOwner { return @{Value='S-1-5-21-other'} }; return $acl }
    Reject { Assert-MewObjectOwner $owner 'S-1-5-21-ours' }
  `.replace('next safe response\n"', 'next safe response`n"'))
})

test('Windows setup reruns verify and repair only owned executable version with injected operations', { skip: !existsSync(powershell) }, async () => temporary(async root => {
  await fs.writeFile(path.join(root, 'install-manifest.json'), JSON.stringify(manifest))
  runPowerShell(`
    . ([ScriptBlock]::Create([IO.File]::ReadAllText(${psLiteral(windowsPath(path.join(source, 'installer-core.ps1')))})))
    . ([ScriptBlock]::Create([IO.File]::ReadAllText(${psLiteral(windowsPath(path.join(source, 'launcher-core.ps1')))})))
    function Assert($condition, $message) { if (-not $condition) { throw $message } }
    $app=${psLiteral(windowsPath(root))}; $sid='S-1-5-21-test'; $stateRoot=Join-Path $app 'state'; $script:imports=0; $script:provisions=0; $script:healthy=$false; $script:registered=$false
    function Protect-MewDirectory($Directory) { [void][IO.Directory]::CreateDirectory($Directory) }
    function Test-MewWindowsReady { return $true }
    function Get-MewDistroRegistration { if ($script:registered) { return @{BasePath=(Join-Path $stateRoot 'environment')} }; return $null }
    function Get-MewDownload { return 'C:\\fake-verified-download' }
    function Test-MewInstalledRuntime { return $script:healthy }
    function Remove-MewResume { }
    function Invoke-MewNative($File,[string[]]$Arguments,$Timeout) {
      if ($Arguments[0] -eq '--import') { $script:imports++; $script:registered=$true; return @{Code=0} }
      if ($Arguments -contains 'wslpath') { return @{Code=0;Output='/safe/'+[IO.Path]::GetFileName($Arguments[-1])} }
      if ($Arguments -contains '/safe/bootstrap-linux.sh') { $script:provisions++; if ($script:provisionFail) { return @{Code=1} }; $script:healthy=$true; return @{Code=0} }
      if ($Arguments -contains 'mew-claim') { [IO.File]::WriteAllText((Join-Path $app 'claim-fixture.sh'), $Arguments[[Array]::IndexOf($Arguments, '-c')+1]); return @{Code=0} }
      throw 'Unexpected mocked operation'
    }
    [void][IO.Directory]::CreateDirectory($stateRoot)
    [IO.File]::WriteAllText((Join-Path $stateRoot 'user-account-fixture'),'preserved')
    $result=Invoke-MewSetup $app $stateRoot ignored $sid AMD64 ignored
    Assert ($result -eq 0 -and $script:imports -eq 1 -and $script:provisions -eq 1) 'fresh preparation'
    $result=Invoke-MewSetup $app $stateRoot ignored $sid AMD64 ignored
    Assert ($result -eq 0 -and $script:provisions -eq 1) 'healthy rerun avoids provisioning'
    $script:healthy=$false
    $result=Invoke-MewSetup $app $stateRoot ignored $sid AMD64 ignored
    Assert ($result -eq 0 -and $script:imports -eq 1 -and $script:provisions -eq 2) 'corrupt same-version runtime is repaired'
    Assert ([IO.File]::ReadAllText((Join-Path $stateRoot 'user-account-fixture')) -eq 'preserved') 'account data preserved'
    $state=Get-Content (Join-Path $stateRoot 'installation.json') -Raw|ConvertFrom-Json
    Assert ($state.phase -eq 'ready' -and $state.version -eq '1.2.3') 'durable ready state'
    $updated=Get-Content (Join-Path $app 'install-manifest.json') -Raw|ConvertFrom-Json
    $updated.runtime.version='1.2.4'; $updated.runtime.sha256='b'*64
    [IO.File]::WriteAllText((Join-Path $app 'install-manifest.json'),($updated|ConvertTo-Json -Depth 8))
    $script:provisionFail=$true; $failed=$false
    try { Invoke-MewSetup $app $stateRoot ignored $sid AMD64 ignored } catch { $failed=$true }
    $crash=Get-Content (Join-Path $stateRoot 'installation.json') -Raw|ConvertFrom-Json
    Assert ($failed -and $crash.phase -eq 'provisioning') 'failed upgrade preserves retry journal'
    $active=Get-MewLaunchRuntime $crash $updated
    Assert ($active.runtime.version -eq '1.2.3' -and $active.runtime.sha256 -eq ('a'*64)) 'failed upgrade and crash state retain launchable last-good identity'
    $script:provisionFail=$false; $script:registered=$false; $stateRoot=Join-Path $app 'partial'
    [void][IO.Directory]::CreateDirectory((Join-Path $stateRoot 'environment'))
    [IO.File]::WriteAllText((Join-Path $stateRoot 'environment/partial.vhdx'),'preserve incomplete import')
    $partial=[pscustomobject]@{format=1;ownerSid=$sid;distro=(Get-MewIdentity $sid).Distro;installationId=('a'*32);phase='importing';version='';boot='';resumePhase='pending'}
    Write-MewState (Join-Path $stateRoot 'installation.json') $partial
    Assert ((Invoke-MewSetup $app $stateRoot ignored $sid AMD64 ignored) -eq 0) 'interrupted initial import retries'
    $quarantined=@(Get-ChildItem $stateRoot -Directory -Filter 'environment.incomplete-*')
    Assert ($quarantined.Count -eq 1 -and [IO.File]::ReadAllText((Join-Path $quarantined[0].FullName 'partial.vhdx')) -eq 'preserve incomplete import') 'partial disk is preserved in quarantine'
  `)
  if (process.platform === 'linux') {
    const opt = path.join(root, 'marker-fixture'), own = path.join(opt, 'mew'), id = 'a'.repeat(32)
    const claim = (await fs.readFile(path.join(root, 'claim-fixture.sh'), 'utf8')).replaceAll('/opt', opt)
    const run = (identity = id, phase = 'importing') => spawnSync('/bin/sh', ['-c', claim, 'mew-claim', identity, phase])
    await fs.mkdir(own, { recursive: true })
    assert.equal(run().status, 0, 'claim resumes after mkdir before marker')
    assert.equal(await fs.readFile(path.join(own, '.installation-id'), 'utf8'), id)
    assert.equal(existsSync(path.join(opt, `.mew-installation-id-${id}.tmp`)), false, 'marker promotion is atomic')
    assert.equal(run(id, 'provisioning').status, 0)
    assert.notEqual(run('b'.repeat(32)).status, 0, 'mismatched marker cannot be adopted')
    await fs.rm(own, { recursive: true }); await fs.mkdir(own); await fs.writeFile(path.join(own, 'foreign'), 'preserved')
    assert.notEqual(run().status, 0, 'nonempty unmarked directory cannot be adopted')
    assert.equal(await fs.readFile(path.join(own, 'foreign'), 'utf8'), 'preserved')
    await fs.rename(own, `${own}.foreign`); await fs.symlink(`${own}.foreign`, own)
    assert.notEqual(run().status, 0, 'symlink directory cannot be adopted')
  }
}))

test('Windows preparation resumes once after reboot and refuses foreign environments before mutation', { skip: !existsSync(powershell) }, async () => temporary(async root => {
  await fs.writeFile(path.join(root, 'install-manifest.json'), JSON.stringify(manifest))
  runPowerShell(`
    . ([ScriptBlock]::Create([IO.File]::ReadAllText(${psLiteral(windowsPath(path.join(source, 'installer-core.ps1')))})))
    function Assert($condition, $message) { if (-not $condition) { throw $message } }
    function Reject($operation) { $failed=$false; try { & $operation } catch { $failed=$true }; Assert $failed 'Expected refusal' }
    $app=${psLiteral(windowsPath(root))}; $sid='S-1-5-21-test'; $stateRoot=Join-Path $app 'state'; $script:enabled=0; $script:resumed=0; $script:boot='boot1'; $script:foreign=$false
    function Protect-MewDirectory($Directory) { [void][IO.Directory]::CreateDirectory($Directory) }
    function Test-MewWindowsReady { return $false }
    function Test-MewWindowsFeaturesReady { return $false }
    function Get-MewDistroRegistration { if ($script:foreign) { return @{BasePath='C:\\somebody-else'} }; return $null }
    function Get-MewBootStamp { return $script:boot }
    function Enable-MewWindowsEnvironment { $script:enabled++ }
    function Set-MewResume { $script:resumed++ }
    function Invoke-MewNative { throw 'Unexpected environment modification' }
    Assert ((Invoke-MewSetup $app $stateRoot ignored $sid AMD64 ignored) -eq 3010) 'restart required'
    Assert ($script:enabled -eq 1 -and $script:resumed -eq 1) 'one explicit UAC preparation'
    Assert ((Invoke-MewSetup $app $stateRoot ignored $sid AMD64 ignored) -eq 3010) 'same-boot retry waits'
    Assert ($script:enabled -eq 1) 'retry must not repeat UAC'
    $script:boot='boot2'
    Reject { Invoke-MewSetup $app $stateRoot ignored $sid AMD64 ignored }
    Assert ($script:enabled -eq 1) 'failed reboot must not loop'
    $fresh=Join-Path $app 'foreign'; $script:foreign=$true
    Reject { Invoke-MewSetup $app $fresh ignored $sid AMD64 ignored }
    Assert (-not (Test-Path (Join-Path $fresh 'installation.json'))) 'foreign registration must not be claimed'
    $arm=Join-Path $app 'arm'
    Reject { Invoke-MewSetup $app $arm ignored $sid ARM64 ignored }
    Assert (-not (Test-Path $arm)) 'unsupported architecture must fail before filesystem changes'
    $script:foreign=$false; $cancel=Join-Path $app 'cancel'
    function Enable-MewWindowsEnvironment { throw 'user cancelled' }
    Reject { Invoke-MewSetup $app $cancel ignored $sid AMD64 ignored }
    Assert ((Get-Content (Join-Path $cancel 'installation.json') -Raw|ConvertFrom-Json).phase -eq 'pending') 'cancel preserves retry journal'
  `)
}))

test('reboot continuation installs missing WSL package after features and bounds a second reboot', { skip: !existsSync(powershell) }, async () => temporary(async root => {
  await fs.writeFile(path.join(root, 'install-manifest.json'), JSON.stringify(manifest))
  runPowerShell(`
    . ([ScriptBlock]::Create([IO.File]::ReadAllText(${psLiteral(windowsPath(path.join(source, 'installer-core.ps1')))})))
    function Assert($condition, $message) { if (-not $condition) { throw $message } }
    $app=${psLiteral(windowsPath(root))}; $sid='S-1-5-21-test'; $identity=Get-MewIdentity $sid
    $script:ready=$false; $script:complete=$true; $script:stages=@(); $script:boot='boot2'; $stateRoot=Join-Path $app 'state'
    function Protect-MewDirectory($Directory) { [void][IO.Directory]::CreateDirectory($Directory) }
    function Test-MewWindowsReady { return $script:ready }
    function Test-MewWindowsFeaturesReady { return $true }
    function Get-MewBootStamp { return $script:boot }
    function Get-MewDistroRegistration { return @{BasePath=(Join-Path $stateRoot 'environment')} }
    function Enable-MewWindowsEnvironment($Wsl,$Stage) { $script:stages+= $Stage; $script:ready=$script:complete }
    function Set-MewResume { }
    function Remove-MewResume { }
    function Test-MewInstalledRuntime { return $true }
    function Invoke-MewNative($File,[string[]]$Arguments) { if ($Arguments -contains 'mew-claim') { return @{Code=0} }; throw 'Unexpected operation' }
    [void][IO.Directory]::CreateDirectory($stateRoot)
    $state=[pscustomobject]@{format=1;ownerSid=$sid;distro=$identity.Distro;installationId=('a'*32);phase='reboot';version='1.2.3';boot='boot1';resumePhase='ready';preparationStage='features'}
    Write-MewState (Join-Path $stateRoot 'installation.json') $state
    Assert ((Invoke-MewSetup $app $stateRoot ignored $sid AMD64 ignored) -eq 0) 'feature reboot must continue package installation'
    Assert ($script:stages.Count -eq 1 -and $script:stages[0] -eq 'wsl') 'run only missing package stage'
    $script:ready=$false; $script:complete=$false; $script:stages=@()
    Write-MewState (Join-Path $stateRoot 'installation.json') $state
    Assert ((Invoke-MewSetup $app $stateRoot ignored $sid AMD64 ignored) -eq 3010) 'package installation may request its own restart'
    $script:boot='boot3'; $failed=$false
    try { Invoke-MewSetup $app $stateRoot ignored $sid AMD64 ignored } catch { $failed=$true }
    Assert ($failed -and $script:stages.Count -eq 1) 'failed package reboot does not repeat installation forever'
  `)
}))

test('release publication requires exact source and signing, hashes signed bytes, preserves immutable assets', async () => {
  const workflow = await fs.readFile(path.resolve(source, '../../.github/workflows/windows-installer-release.yml'), 'utf8')
  assert.match(workflow, /runtimeCommit -ne \$sourceCommit/)
  assert.match(workflow, /environment: windows-installer-release/)
  assert.match(workflow, /Unsigned source artifacts must not be published/)
  assert.ok(workflow.indexOf('Get-FileHash artifacts/mew-windows-setup-x64.exe') > workflow.indexOf('sign /sha1'))
  assert.match(workflow, /gh release download/)
  assert.doesNotMatch(workflow, /--clobber/)
})
