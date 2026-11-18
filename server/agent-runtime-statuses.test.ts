import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-runtime-status-'))
process.env.MEW_DATA_DIR = temporary
const { installRuntime, runtimeStatusesAsync } = await import('./agentRuntimeInstall.ts')
const { RUNTIMES, runtimeInstallationCommand } = await import('./agentRuntimes.ts')
const { writeAgentSetting, deleteAgentSetting } = await import('./agentSettings.ts')
after(() => fs.rmSync(temporary, { recursive: true, force: true }))

test('an invalid saved path for an already-installed runtime points to settings instead of reinstalling', async t => {
  const original = RUNTIMES.kimi.installationCommand
  RUNTIMES.kimi.installationCommand = () => process.execPath
  t.after(() => {
    RUNTIMES.kimi.installationCommand = original
    deleteAgentSetting('kimi')
  })
  writeAgentSetting('kimi', { cmd: path.join(temporary, 'missing-kimi') })
  const status = async () => (await runtimeStatusesAsync()).find(row => row.id === 'kimi')!
  assert.equal((await status()).installed, false)
  assert.equal((await status()).installable, false)
  assert.equal((await status()).installBlocker, 'configured-command')
  await assert.rejects(installRuntime('kimi'), /경로를 수정하거나 비워 주세요/)
  deleteAgentSetting('kimi')
  assert.equal((await status()).installed, true)
  assert.equal((await status()).installBlocker, undefined)
})

test('Codex with a connector and no host CLI still needs installation', async t => {
  const original = RUNTIMES.codex.installationCommand
  const originalCli = process.env.MEW_AGENT_CODEX_CLI_CMD
  RUNTIMES.codex.installationCommand = () => process.execPath
  t.after(() => {
    RUNTIMES.codex.installationCommand = original
    if (originalCli === undefined) delete process.env.MEW_AGENT_CODEX_CLI_CMD
    else process.env.MEW_AGENT_CODEX_CLI_CMD = originalCli
  })
  const status = async () => (await runtimeStatusesAsync()).find(row => row.id === 'codex')!
  process.env.MEW_AGENT_CODEX_CLI_CMD = path.join(temporary, 'missing-codex')
  assert.equal((await status()).connectorInstalled, true)
  assert.equal((await status()).installed, false)
  assert.equal((await status()).installable, true)
  process.env.MEW_AGENT_CODEX_CLI_CMD = process.execPath
  assert.equal((await status()).installed, true)
})

test('runtime status reads share async PATH probes and never construct launch-only host CLI settings', async t => {
  const previousPath = process.env.PATH
  process.env.PATH = '/fixture/bin:/fixture/windows mount'
  const probes: string[] = []
  let release!: () => void, scanning!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const started = new Promise<void>(resolve => { scanning = resolve })
  const sync = t.mock.method(fs, 'accessSync', () => { throw new Error('synchronous executable probe forbidden') })
  t.mock.method(fs.promises, 'stat', async () => ({ isFile: () => true }))
  t.mock.method(fs.promises, 'access', async (file: fs.PathLike) => {
    probes.push(String(file))
    if (String(file) === '/fixture/bin/hermes') { scanning(); await gate; return }
    if (/claude-agent-acp|codex-acp/.test(String(file))) return
    throw new Error('fixture executable missing')
  })
  try {
    const first = runtimeStatusesAsync(), second = runtimeStatusesAsync()
    await started
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.equal(probes.filter(file => file === '/fixture/bin/hermes').length, 1, 'concurrent calls share each executable lookup')
    release()
    const [a, b] = await Promise.all([first, second])
    assert.deepEqual(a, b)
    assert.deepEqual(a.map(row => row.id), Object.keys(RUNTIMES))
    assert.equal(a.find(row => row.id === 'hermes')?.installed, true)
    assert.equal(a.find(row => row.id === 'cursor')?.installed, false)
    assert.equal(a.find(row => row.id === 'prime')?.installed, false, 'Prime installation checks its real CLI, not the Node adapter')
    assert.equal(sync.mock.callCount(), 0, 'presence reads do not resolve launch-only host binaries synchronously')
  } finally {
    release()
    if (previousPath === undefined) delete process.env.PATH
    else process.env.PATH = previousPath
  }
})

test('changed runtime command settings do not join an obsolete status scan or reuse completed presence results', async t => {
  const oldCommand = path.join(temporary, 'old-hermes'), newCommand = path.join(temporary, 'new-hermes')
  let release!: () => void, scanning!: () => void, newProbes = 0
  const gate = new Promise<void>(resolve => { release = resolve })
  const started = new Promise<void>(resolve => { scanning = resolve })
  t.mock.method(fs.promises, 'stat', async () => ({ isFile: () => true }))
  t.mock.method(fs.promises, 'access', async (file: fs.PathLike) => {
    if (file === oldCommand) { scanning(); await gate; throw new Error('old executable removed') }
    if (file === newCommand) { newProbes++; return }
    throw new Error('fixture executable missing')
  })
  try {
    writeAgentSetting('hermes', { cmd: oldCommand })
    const old = runtimeStatusesAsync()
    await started
    writeAgentSetting('hermes', { cmd: newCommand })
    assert.equal(runtimeInstallationCommand('hermes'), newCommand)
    assert.equal((await runtimeStatusesAsync()).find(row => row.id === 'hermes')?.installed, true)
    release()
    assert.equal((await old).find(row => row.id === 'hermes')?.installed, false)
    assert.equal((await runtimeStatusesAsync()).find(row => row.id === 'hermes')?.installed, true)
    assert.equal(newProbes, 2, 'completed presence reads remain fresh for externally installed or removed tools')
  } finally { release(); deleteAgentSetting('hermes') }
})
