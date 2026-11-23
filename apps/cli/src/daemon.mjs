import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createServer, createConnection } from 'node:net'
import { spawn } from 'node:child_process'

export function controlPath(options) {
  const id = createHash('sha256').update(path.resolve(options.dataDir)).digest('hex').slice(0, 24)
  const socket = path.join(options.stateDir, 'control', `${id}.sock`)
  const maxBytes = process.platform === 'darwin' ? 103 : 107
  if (!process.getuid || Buffer.byteLength(socket) <= maxBytes) return socket
  const key = createHash('sha256').update(path.resolve(socket)).digest('hex').slice(0, 24)
  return path.join('/tmp', `mew-control-${process.getuid()}`, `${key}.sock`)
}

async function checkShortControlDirectory(directory) {
  const stat = await fs.lstat(directory)
  if (!stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700) {
    throw new Error('Mew requires a private socket directory owned by this account.')
  }
}

export async function requestDaemon(options, action = 'open', { timeout = 10_000 } = {}) {
  const filename = controlPath(options)
  const directory = path.dirname(filename)
  if (directory !== path.join(options.stateDir, 'control')) {
    try { await checkShortControlDirectory(directory) } catch (error) {
      if (error.code === 'ENOENT') return null
      throw error
    }
  }
  return new Promise((resolve, reject) => {
    const socket = createConnection(filename)
    let body = '', settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true; socket.destroy()
      if (error) reject(error)
      else resolve(value)
    }
    socket.setTimeout(timeout, () => finish(new Error('Mew did not respond. Check its local log before retrying.')))
    socket.once('connect', () => socket.write(JSON.stringify({ action }) + '\n'))
    socket.on('data', data => {
      body += data.toString()
      if (body.length > 16_384) return finish(new Error('Invalid Mew control response.'))
      if (!body.includes('\n')) return
      try {
        const response = JSON.parse(body.split('\n')[0])
        if (response.error) finish(new Error(response.error))
        else finish(null, response)
      } catch (error) { finish(error) }
    })
    socket.once('error', error => ['ENOENT', 'ECONNREFUSED'].includes(error.code) ? finish(null, null) : finish(error))
    socket.once('end', () => { if (!settled) finish(new Error('Mew closed its control connection.')) })
  })
}

/** The directory and socket are private to the OS account; setup URLs never reach disk. */
export function daemonControl(options, { notify = message => { if (process.connected) process.send(message) }, shutdown = () => process.kill(process.pid, 'SIGTERM') } = {}) {
  let server, host, currentUrl, stopped = false, stopRequested = false
  let resolveHost
  const connected = new Promise(resolve => { resolveHost = resolve })
  const sockets = new Set()
  const filename = controlPath(options)
  return {
    get stopRequested() { return stopRequested },
    async start() {
      const directory = path.dirname(filename)
      await fs.mkdir(directory, { recursive: true, mode: 0o700 })
      if (directory === path.join(options.stateDir, 'control')) await fs.chmod(directory, 0o700)
      else await checkShortControlDirectory(directory)
      const existing = await requestDaemon(options, 'status')
      if (existing) throw new Error('Mew is already running for this data directory.')
      await fs.rm(filename, { force: true })
      server = createServer(socket => {
        sockets.add(socket)
        socket.once('close', () => sockets.delete(socket))
        socket.setTimeout(15_000, () => socket.destroy())
        let body = '', handled = false
        socket.on('data', data => {
          body += data.toString()
          if (body.length > 1024) return socket.destroy()
          if (handled || !body.includes('\n')) return
          handled = true
          void (async () => {
            const { action } = JSON.parse(body.split('\n')[0])
            if (action === 'status') return socket.end(JSON.stringify({ running: true, ready: !!currentUrl }) + '\n')
            if (action === 'stop') {
              stopRequested = true
              socket.end(JSON.stringify({ stopping: true }) + '\n')
              socket.once('finish', shutdown)
              return
            }
            if (action !== 'open') throw new Error('Unknown Mew control action.')
            await connected
            if (stopped) throw new Error('Mew is shutting down.')
            const url = await host.reopen()
            socket.end(JSON.stringify({ url }) + '\n')
          })().catch(() => { if (!socket.destroyed) socket.end(JSON.stringify({ error: 'Could not open Mew. Check its local log.' }) + '\n') })
        })
      })
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(filename, resolve) })
      await fs.chmod(filename, 0o600)
    },
    host(value) { host = value; resolveHost() },
    ready(url) { currentUrl = url; notify({ type: 'mew-ready', url }) },
    async close() {
      stopped = true; resolveHost()
      if (!server) return
      for (const socket of sockets) socket.destroy()
      await new Promise(resolve => server.close(resolve))
      await fs.rm(filename, { force: true })
      server = null
    },
  }
}

export function serviceArguments(options) {
  return ['--service', '--workspace', options.workspace, '--data-dir', options.dataDir, '--cache-dir', options.cacheDir,
    ...(options.installChannel ? ['--install-channel', options.installChannel] : []),
    ...(!options.explicitPort && options.port === 5000 ? [] : ['--port', String(options.port)]),
    ...(options.settingsFile ? ['--settings', options.settingsFile] : []),
    ...(options.ownerEmail ? ['--owner-email', options.ownerEmail] : [])]
}

export async function saveLaunchSettings(options) {
  const directory = options.dataDir + '.installation'
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  await fs.chmod(directory, 0o700)
  const filename = path.join(directory, 'settings.env')
  const content = `DATABASE_URL=${JSON.stringify(options.databaseUrl || '')}\nMEW_TEAM_PORT=${options.port}\n`
  await fs.writeFile(filename, content, { mode: 0o600 })
  await fs.chmod(filename, 0o600)
  return { ...options, settingsFile: filename }
}

export async function startBackground(entry, options, { node = process.execPath, spawnImpl = spawn, timeout = 20 * 60_000 } = {}) {
  await fs.mkdir(options.stateDir, { recursive: true, mode: 0o700 })
  const logPath = path.join(options.stateDir, 'mew.log')
  const output = await fs.open(logPath, 'a', 0o600)
  let child
  try {
    child = spawnImpl(node, [entry, ...serviceArguments(options)], { detached: true, stdio: ['ignore', output.fd, output.fd, 'ipc'], env: process.env })
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill('SIGTERM')
        reject(new Error(`Mew did not finish starting. Check ${logPath}.`))
      }, timeout)
      const failed = error => { clearTimeout(timer); reject(error) }
      child.once('error', failed)
      child.once('exit', code => failed(new Error(`Mew exited before it was ready (${code}). Check ${logPath}.`)))
      child.on('message', message => {
        if (message?.type !== 'mew-ready') return
        try {
          const url = new URL(message.url)
          if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) throw new Error('Invalid Mew readiness address.')
          clearTimeout(timer)
          child.removeListener('error', failed)
          child.disconnect()
          child.unref()
          resolve(url.href)
        } catch (error) { child.kill('SIGTERM'); failed(error) }
      })
    })
  } finally { await output.close() }
}
