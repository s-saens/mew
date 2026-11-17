import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { preparePostgres, postgresDirectory, postgresPort, loadPostgresRuntime } from '../src/postgres.mjs'
import { createServer } from 'node:net'

async function fixture(t, overrides = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-managed-postgres-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const dataDir = path.join(root, 'accounts')
  const cluster = path.join(postgresDirectory(dataDir), 'cluster')
  const calls = [], clients = [], statements = [], processes = [], ports = []
  let running = false, database = false
  class Client {
    constructor(options) { clients.push(options) }
    on() {}
    async connect() { if (!running && !overrides.existing) throw new Error('connection refused') }
    async query(sql, params) {
      statements.push({ sql, params })
      if (sql.includes('data_directory')) return { rows: [{ directory: overrides.foreignDirectory || cluster }] }
      if (sql.startsWith('SELECT 1')) return { rows: database ? [{ '?column?': 1 }] : [] }
      if (sql.startsWith('CREATE DATABASE')) database = true
      return { rows: [] }
    }
    async end() {}
  }
  const spawnImpl = (file, args, options) => {
    const child = new EventEmitter()
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.pid = 1234
    child.kill = signal => { calls.push({ kill: signal }); running = false; queueMicrotask(() => child.emit('exit', 0, signal)); return true }
    calls.push({ file, args, options }); processes.push(child)
    if (file === '/fixture/initdb') {
      void (async () => {
        if (overrides.init) return overrides.init(child, args)
        await fs.mkdir(cluster, { recursive: true })
        await fs.writeFile(path.join(cluster, 'PG_VERSION'), '18\n')
        child.emit('exit', 0, null)
      })().catch(error => child.emit('error', error))
    } else {
      running = true
      if (overrides.start) overrides.start(child, processes.filter(item => item !== processes[0]).length)
    }
    return child
  }
  const options = { dataDir, env: {}, getuid: () => 1000, log: () => {}, spawnImpl,
    loadRuntime: async () => ({ initdb: '/fixture/initdb', postgres: '/fixture/postgres', Client }),
    selectPort: async preferred => { ports.push(preferred); return 55432 }, startupTimeout: 100, initTimeout: 100, stopTimeout: 20 }
  return { dataDir, cluster, calls, clients, statements, processes, ports, options }
}

test('an explicit DATABASE_URL bypasses local installation without inspecting the supplied server', async () => {
  const connection = 'postgresql://external-user:secret@example.test/existing'
  const result = await preparePostgres('/not-installed', { databaseUrl: connection, dataDir: '/not-created', loadRuntime() { assert.fail('must not load binaries') } })
  assert.equal(result.databaseUrl, connection)
  assert.equal(result.managed, false)
  await result.stop()
})

test('a first launch creates a private sibling cluster and database, keeps passwords off argv, and owns shutdown', async t => {
  const f = await fixture(t)
  const result = await preparePostgres('/fixture', f.options)
  t.after(() => result.stop())
  const dir = postgresDirectory(f.dataDir)
  await assert.rejects(fs.stat(f.dataDir), { code: 'ENOENT' }, 'managed files must not change first-owner freshness')
  const state = JSON.parse(await fs.readFile(path.join(dir, 'installation.json'), 'utf8'))
  assert.match(state.password, /^[\w-]{43}$/)
  assert.equal(state.port, 55432)
  assert.equal((await fs.stat(dir)).mode & 0o777, 0o700)
  assert.equal((await fs.stat(path.join(dir, 'installation.json'))).mode & 0o777, 0o600)
  assert.deepEqual((await fs.readdir(dir)).sort(), ['cluster', 'installation.json'])
  assert.ok(f.calls[0].args.includes('--auth-host=scram-sha-256'))
  assert.ok(f.calls[0].args.includes('--auth-local=scram-sha-256'))
  assert.ok(f.calls[1].args.includes('127.0.0.1'))
  assert.ok(f.calls[1].args.includes('unix_socket_directories='))
  assert.ok(!JSON.stringify(f.calls.map(call => call.args)).includes(state.password))
  assert.equal(f.clients[0].password, state.password)
  assert.ok(f.statements.some(item => item.sql === 'CREATE DATABASE "mew"'))
  assert.equal(result.databaseUrl, `postgresql://mew:${state.password}@127.0.0.1:55432/mew`)
  await result.stop()
  assert.ok(f.calls.some(call => call.kill === 'SIGINT'))
  await result.failure
})

test('relaunch reuses the cluster and credentials without initializing or deleting stored data', async t => {
  const f = await fixture(t)
  const initial = await preparePostgres('/fixture', f.options)
  await initial.stop()
  const state = await fs.readFile(path.join(postgresDirectory(f.dataDir), 'installation.json'), 'utf8')
  const sentinel = path.join(f.cluster, 'user-data')
  await fs.writeFile(sentinel, 'keep this database')
  f.calls.length = 0
  const next = await preparePostgres('/fixture', f.options)
  t.after(() => next.stop())
  assert.equal(f.calls.filter(call => call.file === '/fixture/initdb').length, 0)
  assert.equal(next.databaseUrl, initial.databaseUrl)
  assert.equal(await fs.readFile(path.join(postgresDirectory(f.dataDir), 'installation.json'), 'utf8'), state)
  assert.equal(await fs.readFile(sentinel, 'utf8'), 'keep this database')
})

test('an incompatible PostgreSQL major is preserved and never initialized or started', async t => {
  const f = await fixture(t)
  const initial = await preparePostgres('/fixture', f.options)
  await initial.stop()
  await fs.writeFile(path.join(f.cluster, 'PG_VERSION'), '17\n')
  f.calls.length = 0
  await assert.rejects(preparePostgres('/fixture', f.options), /major version differs/)
  assert.equal(await fs.readFile(path.join(f.cluster, 'PG_VERSION'), 'utf8'), '17\n')
  assert.equal(f.calls.length, 0)
})

test('unknown directories and symlinked clusters cannot be adopted or overwritten', async t => {
  const f = await fixture(t)
  const directory = postgresDirectory(f.dataDir)
  await fs.mkdir(directory)
  await fs.writeFile(path.join(directory, 'unrelated'), 'preserve')
  await assert.rejects(preparePostgres('/fixture', f.options), /Unrecognized/)
  assert.equal(await fs.readFile(path.join(directory, 'unrelated'), 'utf8'), 'preserve')
  await fs.unlink(path.join(directory, 'unrelated'))
  const first = await preparePostgres('/fixture', f.options)
  await first.stop()
  await fs.rename(f.cluster, f.cluster + '-original')
  await fs.symlink(f.cluster + '-original', f.cluster, 'dir')
  await assert.rejects(preparePostgres('/fixture', f.options), /not an ordinary directory/)
})

test('an initialized live orphan is reused only after checking its authenticated data directory', async t => {
  const f = await fixture(t, { existing: true })
  const initial = await preparePostgres('/fixture', f.options)
  await initial.stop()
  await fs.writeFile(path.join(f.cluster, 'postmaster.pid'), `8181\n${f.cluster}\n123\n55433\n`)
  f.calls.length = 0
  const next = await preparePostgres('/fixture', { ...f.options, alive: () => true })
  assert.equal(next.reused, true)
  assert.ok(next.databaseUrl.includes(':55433/'))
  await next.stop()
  assert.equal(f.calls.length, 0)
  await assert.rejects(preparePostgres('/fixture', { ...f.options, alive: () => true, loadRuntime: async () => ({ Client: class { on() {} async connect() { throw new Error('authentication failed') } async end() {} } }) }), /could not be authenticated/)
  assert.equal(f.calls.length, 0, 'never stop a PID merely because its number was recorded')
})

test('init failure and cancellation remove temporary credentials and stop only the owned child', async t => {
  const f = await fixture(t, { init(child) { queueMicrotask(() => { child.stderr.write('init failure'); child.emit('exit', 1, null) }) } })
  await assert.rejects(preparePostgres('/fixture', f.options), /initialization failed/)
  assert.ok(!(await fs.readdir(postgresDirectory(f.dataDir))).some(file => file.startsWith('.password-')))
  const controller = new AbortController()
  const cancelled = await fixture(t, { init() { controller.abort(new Error('cancel setup')) } })
  await assert.rejects(preparePostgres('/fixture', { ...cancelled.options, signal: controller.signal }), /initialization failed/)
  assert.ok(cancelled.calls.some(call => call.kill === 'SIGINT'))
  assert.ok(!(await fs.readdir(postgresDirectory(cancelled.dataDir))).some(file => file.startsWith('.password-')))
})

test('unexpected owned database exit is observable after readiness', async t => {
  const f = await fixture(t)
  const result = await preparePostgres('/fixture', f.options)
  f.processes.at(-1).stderr.write('disk full')
  f.processes.at(-1).emit('exit', 1, null)
  await assert.rejects(result.failure, /stopped unexpectedly.*disk full/)
  await result.stop()
})

test('initialization and readiness timeouts terminate owned children and preserve partial files', async t => {
  const init = await fixture(t, { init() {} })
  await assert.rejects(preparePostgres('/fixture', { ...init.options, initTimeout: 10 }), /initialization timed out/)
  assert.ok(init.calls.some(call => call.kill === 'SIGINT'))
  const ready = await fixture(t)
  const initial = await preparePostgres('/fixture', ready.options)
  await initial.stop()
  ready.calls.length = 0
  class UnreadyClient { on() {} async connect() { throw new Error('not ready') } async end() {} }
  await assert.rejects(preparePostgres('/fixture', { ...ready.options, startupTimeout: 10, loadRuntime: async () => ({ initdb: '/fixture/initdb', postgres: '/fixture/postgres', Client: UnreadyClient }) }), /did not become ready/)
  assert.ok(ready.calls.some(call => call.kill === 'SIGINT'))
  assert.equal(await fs.readFile(path.join(ready.cluster, 'PG_VERSION'), 'utf8'), '18\n')
})

test('port selection avoids another local PostgreSQL or any other listener', async t => {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const occupied = server.address().port
  const selected = await postgresPort(occupied)
  assert.ok(selected > 0 && selected !== occupied)
})

test('the bundled PostgreSQL creates a private cluster and preserves real SQL across relaunch', {
  skip: process.env.MEW_TEST_EMBEDDED_POSTGRES !== '1', timeout: 90_000,
}, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-managed-postgres-smoke-'))
  let database
  t.after(async () => { await database?.stop(); await fs.rm(root, { recursive: true, force: true }) })
  const runtime = process.env.MEW_TEST_POSTGRES_RUNTIME || path.resolve(import.meta.dirname, '../../..')
  const dataDir = path.join(root, 'accounts')
  const env = { ...process.env, DATABASE_URL: '' }
  const binaries = await loadPostgresRuntime(runtime)
  const options = { dataDir, env, log() {} }
  database = await preparePostgres(runtime, options)
  const first = new binaries.Client({ connectionString: database.databaseUrl })
  try {
    await first.connect()
    assert.match((await first.query('SELECT version()')).rows[0].version, /PostgreSQL 18\./)
    assert.equal((await first.query('SHOW listen_addresses')).rows[0].listen_addresses, '127.0.0.1')
    assert.equal((await first.query('SHOW password_encryption')).rows[0].password_encryption, 'scram-sha-256')
    await first.query('CREATE TABLE managed_smoke(value text NOT NULL)')
    await first.query('INSERT INTO managed_smoke VALUES ($1)', ['survives a managed relaunch'])
  } finally { await first.end() }
  await database.stop()
  database = await preparePostgres(runtime, options)
  const next = new binaries.Client({ connectionString: database.databaseUrl })
  try {
    await next.connect()
    assert.deepEqual((await next.query('SELECT value FROM managed_smoke')).rows, [{ value: 'survives a managed relaunch' }])
  } finally { await next.end() }
})
