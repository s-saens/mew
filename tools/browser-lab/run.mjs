import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { openSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { ENGINES, INITIAL_URL, navigationTarget } from './protocol.mjs'
import { createLabServer } from './server.mjs'

const args = process.argv.slice(2)
const option = name => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1] }
const configPath = option('--config')
if (!configPath) throw new Error('Usage: node tools/browser-lab/run.mjs --config <runtime.json> [--detach] [--runtime-dir <directory>] [--initial-url <http(s) URL>]')
const runtime = JSON.parse(await readFile(resolve(configPath), 'utf8'))
const initialUrl = navigationTarget(option('--initial-url') || INITIAL_URL)
const directory = resolve(option('--runtime-dir') || join(tmpdir(), 'mew-browser-manual-lab'))
await mkdir(directory, { recursive: true, mode: 0o700 })

if (args.includes('--detach')) {
  const log = openSync(join(directory, 'server.log'), 'a', 0o600)
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...args.filter(value => value !== '--detach')], {
    detached: true, stdio: ['ignore', log, log], env: process.env,
  })
  child.unref()
  await writeFile(join(directory, 'pid'), `${child.pid}\n`, { mode: 0o600 })
  const deadline = Date.now() + 10000
  let ready = false
  while (Date.now() < deadline) {
    try {
      const checks = await Promise.all(ENGINES.map(async engine => {
        const response = await fetch(`http://127.0.0.1:${engine.port}/health`, { signal: AbortSignal.timeout(500) })
        const data = await response.json()
        return data.pid === child.pid && data.engine === engine.id
      }))
      if (checks.every(Boolean)) { ready = true; break }
    } catch { /* The six owned HTTP listeners may still be starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (!ready) throw new Error(`Browser lab did not become ready. Check ${join(directory, 'server.log')}`)
  console.log(`Browser lab PID ${child.pid}; log: ${join(directory, 'server.log')}`)
  for (const engine of ENGINES) console.log(`${engine.name}: http://localhost:${engine.port}/`)
} else {
  const labs = []
  let stopping = false
  async function close() {
    if (stopping) return
    stopping = true
    await Promise.allSettled(labs.map(lab => lab.close()))
  }
  try {
    for (const engine of ENGINES) labs.push(await createLabServer({ engine, runtime, initialUrl }))
    await writeFile(join(directory, 'pid'), `${process.pid}\n`, { mode: 0o600 })
    for (const engine of ENGINES) console.log(`${engine.name}: http://localhost:${engine.port}/`)
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void close().finally(() => process.exit(0)) })
  } catch (error) {
    await close()
    throw error
  }
}
