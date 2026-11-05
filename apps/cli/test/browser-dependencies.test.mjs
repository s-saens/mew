import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { prepareBrowserDependencies } from '../src/browser-dependencies.mjs'
import { launch } from '../src/launcher.mjs'
import { acquireDataLock } from '../src/lock.mjs'

for (const outcome of ['success', 'failure', 'signal', 'spawn-error']) {
  test(`browser preparation subprocess: ${outcome}`, async () => {
    const before = ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal))
    const env = { MEW_CHROME_EXECUTABLE: '/host/chrome' }
    const operation = prepareBrowserDependencies('/cached/app', { env, spawnImpl: (command, args, options) => {
      assert.equal(command, process.execPath)
      assert.deepEqual(args, [path.join('/cached/app', 'server/browser-dependencies.js'), '--install'])
      assert.equal(options.cwd, '/cached/app')
      assert.equal(options.env, env)
      assert.equal(options.stdio, 'inherit')
      const child = new EventEmitter()
      queueMicrotask(() => {
        if (outcome === 'spawn-error') child.emit('error', new Error('fixture cannot spawn'))
        else child.emit('exit', outcome === 'success' ? 0 : outcome === 'signal' ? null : 1, outcome === 'signal' ? 'SIGINT' : null)
      })
      return child
    } })
    if (outcome === 'success') await operation
    else await assert.rejects(operation, outcome === 'spawn-error' ? /fixture cannot spawn/ : /Browser dependency preparation failed/)
    assert.deepEqual(['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal)), before)
  })
}

for (const failure of [false, true]) {
  test(`launch prepares browsers before the host and releases the lock: ${failure ? 'failure' : 'success'}`, async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-cli-browsers-'))
    t.after(() => fs.rm(root, { recursive: true, force: true }))
    const trace = []
    const options = { dataDir: root, workspace: root, port: 0, legacyPidfile: path.join(root, 'absent.pid') }
    const operation = launch({ options, version: '0.1.0', target: { platform: 'linux', arch: 'x64', nodeMajor: 24 },
      prepare: async () => { trace.push('runtime'); return '/fixture/runtime' },
      prepareBrowsers: async (runtime, { env }) => {
        trace.push('browsers')
        assert.equal(runtime, '/fixture/runtime')
        assert.equal(env.MEW_DATA_DIR, root)
        assert.equal(env.MEW_DISTRIBUTION, 'release')
        if (failure) throw new Error('fixture installation failed')
      },
      host: async () => { trace.push('host'); return 0 },
    })
    if (failure) await assert.rejects(operation, /fixture installation failed/)
    else assert.equal(await operation, 0)
    assert.deepEqual(trace, failure ? ['runtime', 'browsers'] : ['runtime', 'browsers', 'host'])
    const unlock = await acquireDataLock(root)
    await unlock()
  })
}

test('cancellation reaches the installer child and blocks success even if it exits zero', async () => {
  const before = ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal))
  let child
  const signals = []
  const operation = prepareBrowserDependencies('/cached/app', { spawnImpl: () => {
    child = new EventEmitter()
    child.kill = signal => {
      signals.push(signal)
      queueMicrotask(() => child.emit('exit', 0, null))
    }
    return child
  } })
  process.emit('SIGTERM')
  await assert.rejects(operation, /SIGTERM/)
  assert.deepEqual(signals, ['SIGTERM'])
  assert.deepEqual(['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal)), before)
})
