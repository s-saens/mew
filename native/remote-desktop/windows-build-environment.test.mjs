import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const powershell = process.platform === 'win32'
  ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
  : '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'

test('build discovery reuses an activated compiler without a discoverable Visual Studio installation', {
  skip: !existsSync(powershell), timeout: 30_000,
}, () => {
  const file = fileURLToPath(new URL('./windows-build-environment.ps1', import.meta.url))
  const script = process.platform === 'win32' ? file : execFileSync('wslpath', ['-w', file], { encoding: 'utf8' }).trim()
  const commands = ['cl.exe', 'link.exe', 'rc.exe']
  const headers = ['C:\\SDK\\um\\Windows.h', 'C:\\SDK\\ucrt\\stdio.h']
  const cases = [
    { commands, headers, include: 'C:\\SDK\\um;C:\\SDK\\ucrt', ready: true },
    { commands, headers, include: 'C:\\SDK\\um\\;C:\\SDK\\ucrt\\;', ready: true },
    ...commands.map(missing => ({ commands: commands.filter(name => name !== missing), headers, ready: false })),
    ...headers.map(missing => ({ commands, headers: headers.filter(name => name !== missing), ready: false })),
    { commands, headers, include: '', ready: false },
    { commands, headers, compilerArchitecture: 'arm64', ready: false },
    { commands, headers, compilerArchitecture: 'amd64', ready: true },
  ]
  // Mock discovery only; never execute compilers or import the host's SDK.
  const probe = `
$ErrorActionPreference = 'Stop'
function Get-Command {
  [CmdletBinding()] param([string]$Name, [string]$CommandType)
  if ($fixture.commands -contains $Name) { [pscustomobject]@{ Source = 'C:\\Tools\\' + $Name } }
}
function Test-Path {
  [CmdletBinding()] param([string]$LiteralPath)
  return $fixture.headers -contains $LiteralPath
}
$fixtures = @'
${JSON.stringify(cases)}
'@ | ConvertFrom-Json
foreach ($fixture in $fixtures) {
  $env:PROCESSOR_ARCHITECTURE = 'AMD64'
  $env:PROCESSOR_ARCHITEW6432 = ''
  $env:VSCMD_ARG_TGT_ARCH = $fixture.compilerArchitecture
  $env:MEW_TEST_PRIVATE_VALUE = 'must not be serialized'
  $env:INCLUDE = if ($null -ne $fixture.include) { $fixture.include } else { 'C:\\SDK\\um;C:\\SDK\\ucrt' }
  . '${script.replaceAll("'", "''")}'
}`
  const result = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(probe, 'utf16le').toString('base64')], { encoding: 'utf8', timeout: 25_000 })
  assert.equal(result.status, 0, result.stderr)
  const states = result.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line.replace(/^\uFEFF/, '')))
  assert.equal(states.length, cases.length)
  for (let index = 0; index < cases.length; index++) {
    assert.equal(states[index].tools.visualStudio, cases[index].ready, JSON.stringify(cases[index]))
    assert.equal(states[index].environment.MEW_TEST_PRIVATE_VALUE, undefined)
    if (cases[index].ready) assert.equal(states[index].environment.INCLUDE, cases[index].include ?? 'C:\\SDK\\um;C:\\SDK\\ucrt')
  }
})
