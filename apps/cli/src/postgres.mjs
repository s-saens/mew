import fs from 'node:fs/promises'
import path from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'

export const POSTGRES_PACKAGE_VERSION = '18.6.0-beta.19'
export const POSTGRES_MAJOR = '18'
const emptyStop = async () => {}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function bounded(promise, milliseconds, fallback, signal) {
  let timer, cancel
  try {
    return await Promise.race([
      promise,
      new Promise(resolve => { timer = setTimeout(() => resolve(fallback()), milliseconds) }),
      ...(signal ? [new Promise(resolve => { cancel = () => resolve({ error: signal.reason }); signal.addEventListener('abort', cancel, { once: true }); if (signal.aborted) cancel() })] : []),
    ])
  } finally { clearTimeout(timer); if (cancel) signal.removeEventListener('abort', cancel) }
}

export function postgresDirectory(dataDir) {
  return path.resolve(dataDir) + '.postgres'
}

async function exists(file) {
  try { await fs.lstat(file); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error }
}

async function privateDirectory(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  const stat = await fs.lstat(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Managed PostgreSQL path is not an ordinary directory: ${directory}`)
  await fs.chmod(directory, 0o700)
}

async function ordinaryFile(file) {
  const stat = await fs.lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Managed PostgreSQL state is not an ordinary file: ${file}`)
  return stat
}

async function writeState(filename, state) {
  const temporary = `${filename}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporary, JSON.stringify(state) + '\n', { flag: 'wx', mode: 0o600 })
    await fs.rename(temporary, filename)
  } finally { await fs.rm(temporary, { force: true }) }
}

async function loadState(directory) {
  const filename = path.join(directory, 'installation.json')
  if (!await exists(filename)) {
    if ((await fs.readdir(directory)).length) throw new Error(`Unrecognized managed PostgreSQL directory; existing files were preserved: ${directory}`)
    const state = { version: 1, major: POSTGRES_MAJOR, user: 'mew', database: 'mew', password: randomBytes(32).toString('base64url'), port: 0 }
    await fs.writeFile(filename, JSON.stringify(state) + '\n', { flag: 'wx', mode: 0o600 })
    return { filename, state }
  }
  await ordinaryFile(filename)
  const state = JSON.parse(await fs.readFile(filename, 'utf8'))
  if (state.version !== 1 || state.major !== POSTGRES_MAJOR || state.user !== 'mew' || state.database !== 'mew'
    || typeof state.password !== 'string' || !/^[\w-]{43}$/.test(state.password)
    || !Number.isInteger(state.port) || state.port < 0 || state.port > 65535) {
    throw new Error(`Invalid or incompatible managed PostgreSQL installation; existing files were preserved: ${directory}`)
  }
  await fs.chmod(filename, 0o600)
  return { filename, state }
}

export async function postgresPort(preferred = 0) {
  const listen = port => new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      const selected = server.address().port
      server.close(error => error ? reject(error) : resolve(selected))
    })
  })
  try { return await listen(preferred) }
  catch (error) { if (!preferred || error.code !== 'EADDRINUSE') throw error; return listen(0) }
}

/** Resolve only the platform binaries pinned into the verified application runtime. */
export async function loadPostgresRuntime(runtime, platform = process.platform, arch = process.arch) {
  const supported = (platform === 'linux' || platform === 'darwin') && ['x64', 'arm64'].includes(arch)
    || platform === 'win32' && arch === 'x64'
  if (!supported) throw new Error(`Managed PostgreSQL is unavailable for ${platform}/${arch}. Windows installations use the managed WSL runtime.`)
  const require = createRequire(path.join(runtime, 'package.json'))
  const wrapper = require.resolve('embedded-postgres')
  const wrapperRoot = path.resolve(path.dirname(wrapper), '..')
  const wrapperPackage = JSON.parse(await fs.readFile(path.join(wrapperRoot, 'package.json'), 'utf8'))
  if (wrapperPackage.version !== POSTGRES_PACKAGE_VERSION) throw new Error('The Mew runtime contains an incompatible PostgreSQL distribution.')
  const name = `@embedded-postgres/${platform === 'win32' ? 'windows' : platform}-${arch}`
  const entry = require.resolve(name)
  const packageRoot = path.resolve(path.dirname(entry), '..')
  const manifest = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'))
  if (manifest.version !== POSTGRES_PACKAGE_VERSION) throw new Error('The Mew runtime contains incompatible PostgreSQL binaries.')
  const { ensureSymlinks } = await import(pathToFileURL(path.join(wrapperRoot, 'dist', 'symlinks.js')).href)
  const binaries = await import(pathToFileURL(entry).href)
  await ensureSymlinks(binaries.postgres, true)
  const pg = require('pg')
  return { ...binaries, Client: pg.Client }
}

function redacted(message, password) {
  return String(message).replaceAll(password, '[redacted]').slice(-1600)
}

function childResult(child, password) {
  let tail = '', settled = false
  const append = chunk => { tail = (tail + chunk.toString()).slice(-4096) }
  child.stdout?.on('data', append)
  child.stderr?.on('data', append)
  const exited = new Promise(resolve => {
    child.once('error', error => { if (!settled) { settled = true; append(error.message); resolve({ error, tail: () => redacted(tail, password) }) } })
    child.once('exit', (code, signal) => { if (!settled) { settled = true; resolve({ code, signal, tail: () => redacted(tail, password) }) } })
  })
  return { child, exited, get ended() { return settled }, tail: () => redacted(tail, password) }
}

async function stopChild(process, timeout) {
  if (process.ended) return
  process.child.kill('SIGINT')
  const done = await bounded(process.exited.then(() => true), timeout, () => false)
  if (done) return
  process.child.kill('SIGKILL')
  if (!await bounded(process.exited.then(() => true), 2000, () => false)) throw new Error('The managed PostgreSQL process did not stop.')
}

async function runInit(binary, args, options, deps) {
  const process = childResult(deps.spawnImpl(binary, args, options), deps.password)
  const cancelled = () => process.child.kill('SIGINT')
  deps.signal.addEventListener('abort', cancelled, { once: true })
  try {
    const outcome = await bounded(process.exited, deps.timeout, () => ({ error: new Error('Managed PostgreSQL initialization timed out.') }), deps.signal)
    if (outcome.error || outcome.code !== 0 || deps.signal.aborted) {
      await stopChild(process, deps.stopTimeout)
      throw new Error(`Managed PostgreSQL initialization failed. ${redacted(outcome.error?.message || process.tail(), deps.password)}`)
    }
  } finally { deps.signal.removeEventListener('abort', cancelled) }
}

async function withClient(Client, state, database, action) {
  const client = new Client({ host: '127.0.0.1', port: state.port, user: state.user, password: state.password, database, connectionTimeoutMillis: 1000, query_timeout: 1000, statement_timeout: 1000 })
  client.on?.('error', () => {})
  try { await client.connect(); return await action(client) }
  finally { await client.end().catch(() => {}) }
}

async function validateConnection(Client, state, cluster) {
  await withClient(Client, state, 'postgres', async client => {
    const result = await client.query("SELECT current_setting('data_directory') AS directory")
    if (path.resolve(result.rows[0]?.directory || '.') !== cluster) throw new Error('Managed PostgreSQL server identity did not match its data directory.')
    const databases = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [state.database])
    if (!databases.rows.length) await client.query('CREATE DATABASE "mew"')
  })
}

async function existingCluster(Client, state, cluster, alive) {
  const pidfile = path.join(cluster, 'postmaster.pid')
  if (!await exists(pidfile)) return false
  await ordinaryFile(pidfile)
  const lines = (await fs.readFile(pidfile, 'utf8')).split('\n')
  const pid = Number(lines[0]), port = Number(lines[3])
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Managed PostgreSQL has an invalid process marker; files were preserved.')
  if (!alive(pid)) return false
  if (path.resolve(lines[1]) !== cluster || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Managed PostgreSQL has a conflicting process marker; no process was stopped.')
  state.port = port
  try { await validateConnection(Client, state, cluster) }
  catch { throw new Error('An existing process owns the managed PostgreSQL cluster but could not be authenticated. No process was stopped.') }
  return true
}

function connectionUrl(state) {
  return `postgresql://${state.user}:${state.password}@127.0.0.1:${state.port}/${state.database}`
}

/** Prepare the CLI-owned persistent database. This never alters an external DATABASE_URL. */
export async function preparePostgres(runtime, {
  dataDir, databaseUrl, env = process.env, log = console.log, signal,
  loadRuntime = loadPostgresRuntime, spawnImpl = spawn, selectPort = postgresPort,
  alive = pid => { try { process.kill(pid, 0); return true } catch (error) { return error.code !== 'ESRCH' } },
  startupTimeout = 30_000, initTimeout = 60_000, stopTimeout = 10_000,
  getuid = () => process.getuid?.(),
} = {}) {
  const external = databaseUrl ?? env.DATABASE_URL
  if (typeof external === 'string' && external.trim()) return { databaseUrl: external, managed: false, stop: emptyStop }
  if (typeof dataDir !== 'string' || !dataDir) throw new Error('A persistent data directory is required for managed PostgreSQL.')
  if (getuid() === 0) throw new Error('Managed PostgreSQL must run as a regular OS user. Mew does not create or modify OS accounts.')
  const controller = new AbortController()
  const interrupt = () => controller.abort(new Error('Managed PostgreSQL preparation was interrupted.'))
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt)
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
  let owned, stopping = false
  const stop = async () => { stopping = true; if (owned) await stopChild(owned, stopTimeout) }
  try {
    combined.throwIfAborted()
    const directory = postgresDirectory(dataDir)
    await privateDirectory(directory)
    const { filename, state } = await loadState(directory)
    const cluster = path.join(directory, 'cluster')
    if (await exists(cluster)) {
      const stat = await fs.lstat(cluster)
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Managed PostgreSQL cluster is not an ordinary directory: ${cluster}`)
    }
    const versionFile = path.join(cluster, 'PG_VERSION')
    const initialized = await exists(versionFile)
    if (initialized) {
      await privateDirectory(cluster)
      await ordinaryFile(versionFile)
      if ((await fs.readFile(versionFile, 'utf8')).trim() !== POSTGRES_MAJOR) throw new Error('Managed PostgreSQL major version differs from this runtime. Existing data was preserved; automatic migration is not performed.')
    } else if (await exists(cluster) && (await fs.readdir(cluster)).length) {
      throw new Error(`Managed PostgreSQL initialization is incomplete. Existing files were preserved: ${cluster}`)
    }
    const binaries = await loadRuntime(runtime)
    const childOptions = { env: { ...env, LANG: 'C', LC_ALL: 'C' }, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true }
    if (!initialized) {
      log('Preparing the local PostgreSQL database…')
      const passwordFile = path.join(directory, `.password-${randomUUID()}`)
      try {
        await fs.writeFile(passwordFile, state.password + '\n', { flag: 'wx', mode: 0o600 })
        await runInit(binaries.initdb, ['-D', cluster, `--username=${state.user}`, '--encoding=UTF8', '--locale=C', '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', `--pwfile=${passwordFile}`], childOptions,
          { spawnImpl, password: state.password, signal: combined, timeout: initTimeout, stopTimeout })
      } finally { await fs.rm(passwordFile, { force: true }) }
    }
    combined.throwIfAborted()
    if (await existingCluster(binaries.Client, state, cluster, alive)) {
      await writeState(filename, state)
      return { databaseUrl: connectionUrl(state), managed: true, reused: true, stop: emptyStop }
    }
    const deadline = Date.now() + startupTimeout
    const cancelOwned = () => { owned?.child.kill('SIGINT') }
    combined.addEventListener('abort', cancelOwned, { once: true })
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        combined.throwIfAborted()
        state.port = await selectPort(state.port)
        await writeState(filename, state)
        owned = childResult(spawnImpl(binaries.postgres, ['-D', cluster, '-h', '127.0.0.1', '-p', String(state.port), '-c', 'unix_socket_directories=', '-c', 'password_encryption=scram-sha-256'], childOptions), state.password)
        while (!owned.ended && Date.now() < deadline) {
          combined.throwIfAborted()
          try {
            await validateConnection(binaries.Client, state, cluster)
            combined.throwIfAborted()
            const failure = owned.exited.then(() => {
              if (!stopping) throw new Error(`Managed PostgreSQL stopped unexpectedly. ${owned.tail()}`)
            })
            failure.catch(() => {})
            log('Local PostgreSQL is ready.')
            return { databaseUrl: connectionUrl(state), managed: true, stop, failure }
          } catch (error) {
            if (combined.aborted) throw combined.reason
            if (String(error.message).includes('identity')) throw error
          }
          await Promise.race([delay(100), owned.exited])
        }
        const output = owned.tail()
        if (owned.ended && /could not bind|address already in use/i.test(output) && attempt < 2) { state.port = 0; continue }
        throw new Error(`Managed PostgreSQL did not become ready. ${output}`)
      }
    } finally { combined.removeEventListener('abort', cancelOwned) }
    throw new Error('Managed PostgreSQL did not become ready.')
  } catch (error) {
    await stop().catch(() => {})
    throw error
  } finally {
    process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt)
  }
}
