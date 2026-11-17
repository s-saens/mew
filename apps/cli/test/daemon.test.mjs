import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { EventEmitter } from 'node:events'
import { daemonControl, requestDaemon, startBackground, serviceArguments, saveLaunchSettings } from '../src/daemon.mjs'
import { parseOptions } from '../src/options.mjs'
import { runHost } from '../src/launcher.mjs'

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-daemon-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  return { workspace: root, dataDir: path.join(root, 'accounts'), cacheDir: path.join(root, 'runtimes'), stateDir: path.join(root, 'state'), port: 5000 }
}

test('private local control reopens first-owner setup without putting the capability on disk', { skip: process.platform === 'win32' }, async t => {
  const options = await fixture(t), messages = []
  assert.equal(await requestDaemon(options, 'status'), null)
  const control = daemonControl(options, { notify: value => messages.push(value) })
  await control.start()
  t.after(() => control.close())
  assert.deepEqual(await requestDaemon(options, 'status'), { running: true, ready: false })
  const url = 'http://127.0.0.1:5000/#setup=' + 'a'.repeat(43)
  control.host({ reopen: async () => url })
  control.ready(url)
  assert.deepEqual(await requestDaemon(options), { url })
  assert.deepEqual(messages, [{ type: 'mew-ready', url }])
  assert.deepEqual(await requestDaemon(options, 'status'), { running: true, ready: true })
  const entries = await fs.readdir(path.join(options.stateDir, 'control'))
  assert.equal(entries.length, 1)
  assert.equal((await fs.stat(path.join(options.stateDir, 'control'))).mode & 0o777, 0o700)
  assert.equal((await fs.stat(path.join(options.stateDir, 'control', entries[0]))).mode & 0o777, 0o600)
  const competitor = daemonControl(options)
  await assert.rejects(competitor.start(), /already running/)
  assert.deepEqual(await requestDaemon(options), { url })
})

test('background start waits for readiness, detaches the pinned CLI, and keeps logs free of setup URLs', async t => {
  const options = await fixture(t), signals = [], child = new EventEmitter()
  child.disconnect = () => signals.push('disconnect')
  child.unref = () => signals.push('unref')
  child.kill = signal => signals.push(signal)
  const url = 'http://127.0.0.1:5000/#setup=' + 'b'.repeat(43)
  const result = await startBackground('/installed/cli/bin/mew.mjs', options, { spawnImpl(node, args, spawnOptions) {
    assert.equal(node, process.execPath)
    assert.deepEqual(args, ['/installed/cli/bin/mew.mjs', ...serviceArguments(options)])
    assert.equal(spawnOptions.detached, true)
    assert.equal(spawnOptions.stdio[3], 'ipc')
    queueMicrotask(() => child.emit('message', { type: 'mew-ready', url }))
    return child
  } })
  assert.equal(result, url)
  assert.deepEqual(signals, ['disconnect', 'unref'])
  assert.equal(await fs.readFile(path.join(options.stateDir, 'mew.log'), 'utf8'), '')
})

test('a failed background start surfaces its log location', async t => {
  const options = await fixture(t), child = new EventEmitter()
  await assert.rejects(startBackground('/installed/cli', options, { spawnImpl() {
    queueMicrotask(() => child.emit('exit', 1))
    return child
  } }), /exited before it was ready.*mew\.log/)
})

test('login settings preserve an external database privately without putting its credentials in argv', async t => {
  const options = await fixture(t)
  options.databaseUrl = 'postgres://user:private-password@localhost/mew'
  const settings = await saveLaunchSettings(options)
  const args = serviceArguments(settings)
  assert.equal(args.some(arg => arg.includes('private-password')), false)
  const restored = parseOptions(args, { cwd: options.workspace, env: {} })
  assert.equal(restored.databaseUrl, options.databaseUrl)
  if (process.platform !== 'win32') assert.equal((await fs.stat(settings.settingsFile)).mode & 0o777, 0o600)
})

test('daemon reopen consumes only requested readiness and recovers after a missing reply', async () => {
  const child = new EventEmitter(), callbacks = [], sent = []
  child.connected = true
  child.send = message => sent.push(message)
  child.kill = () => child.emit('exit', 1)
  let control
  const operation = runHost('/fixture', { workspace: '/workspace', dataDir: '/data', open: false }, {
    forkImpl: () => child, log: () => {}, reopenTimeout: 5,
    onControl: value => { control = value }, onReady: url => callbacks.push(url),
  })
  child.emit('message', { type: 'ready', url: 'http://127.0.0.1:5000' })
  const first = control.reopen()
  await new Promise(resolve => setImmediate(resolve))
  child.emit('message', { type: 'ready', url: 'http://127.0.0.1:5000' })
  assert.equal(await first, 'http://127.0.0.1:5000')
  child.emit('message', { type: 'ready', url: 'http://127.0.0.1:5000' })
  assert.equal(callbacks.length, 2)
  await assert.rejects(control.reopen(), /did not return/)
  const next = control.reopen()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(sent.length, 3)
  child.emit('message', { type: 'ready', url: 'http://127.0.0.1:5000' })
  assert.equal(await next, 'http://127.0.0.1:5000')
  child.emit('exit', 0)
  assert.equal(await operation, 0)
})

test('private stop marks intentional shutdown without deleting account data', { skip: process.platform === 'win32' }, async t => {
  const options = await fixture(t), signals = []
  await fs.mkdir(options.dataDir)
  await fs.writeFile(path.join(options.dataDir, 'keep.txt'), 'persistent data')
  const control = daemonControl(options, { shutdown: () => signals.push('stop') })
  await control.start()
  t.after(() => control.close())
  assert.deepEqual(await requestDaemon(options, 'stop'), { stopping: true })
  assert.equal(control.stopRequested, true)
  assert.deepEqual(signals, ['stop'])
  assert.equal(await fs.readFile(path.join(options.dataDir, 'keep.txt'), 'utf8'), 'persistent data')
})
