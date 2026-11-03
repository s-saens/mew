import { execFile } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { opendir, readlink } from 'node:fs/promises'
import { promisify } from 'node:util'
import { commandPortParsers } from './command-ports.ts'
import { encodedPowerShell, powershell } from './platform/windows/storage.ts'

const execute = promisify(execFile)
const maxOutput = 2 * 1024 * 1024
const maxProcesses = 4096
const maxDescriptors = 512
const maxLinks = 32768
type ReadText = (file: string, limit: number, signal: AbortSignal) => Promise<string>
type DirectoryNames = (directory: string, limit: number, signal: AbortSignal) => Promise<string[]>
type ReadLink = (file: string, signal: AbortSignal) => Promise<string>
type Run = (command: string, args: string[], signal: AbortSignal) => Promise<string>

export interface DomBrowserPortProcessOptions {
  signal?: AbortSignal
  timeoutMs?: number
  platform?: NodeJS.Platform
  readText?: ReadText
  directoryNames?: DirectoryNames
  readLink?: ReadLink
  run?: Run
}

async function boundedText(file: string, limit: number, signal: AbortSignal): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of createReadStream(file, { signal, highWaterMark: Math.min(limit, 16 * 1024) })) {
    size += chunk.length
    if (size > limit) return ''
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function directoryNames(directory: string, limit: number, signal: AbortSignal): Promise<string[]> {
  const names: string[] = []
  let entries = 0
  for await (const entry of await opendir(directory)) {
    if (signal.aborted || ++entries > limit) break
    if (/^[1-9]\d*$/.test(entry.name) || directory.endsWith('/fd') && entry.name === '0') names.push(entry.name)
  }
  return names
}

async function run(command: string, args: string[], signal: AbortSignal): Promise<string> {
  try {
    const { stdout } = await execute(command, args, { encoding: 'utf8', maxBuffer: maxOutput, timeout: 1000, signal, killSignal: 'SIGKILL', windowsHide: true })
    return stdout
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string }
    if (command === '/usr/sbin/lsof' && failure.code === 1 && failure.stdout === '' && failure.stderr === '') return ''
    throw error
  }
}

function normalizedName(value: string): string {
  return Array.from(value.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/gu, ' ').trim()).slice(0, 80).join('')
}

/** Resolve listener owners without reading arguments, environments, or guessing by port. */
export async function discoverDomBrowserPortProcesses(ports: number[], options: DomBrowserPortProcessOptions = {}): Promise<Map<number, string>> {
  const requested = new Set(ports.filter(port => Number.isInteger(port) && port > 0 && port <= 65535).slice(0, 256))
  const names = new Map<number, Set<string>>()
  if (!requested.size) return new Map()
  const controller = new AbortController()
  const signal = controller.signal
  const cancel = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', cancel, { once: true })
  if (options.signal?.aborted) cancel()
  const add = (port: number, value: string) => {
    if (signal.aborted || !requested.has(port)) return
    const name = normalizedName(value)
    if (!name) return
    const found = names.get(port) ?? new Set<string>()
    found.add(name); names.set(port, found)
  }
  const read = async (file: string, limit: number) => {
    if (signal.aborted) return ''
    try {
      const text = await (options.readText ?? boundedText)(file, limit, signal)
      return Buffer.byteLength(text) <= limit ? text : ''
    } catch { return '' }
  }
  const directory = async (file: string, limit: number) => {
    if (signal.aborted) return []
    try { return (await (options.directoryNames ?? directoryNames)(file, limit, signal)).slice(0, limit).filter(name => /^\d+$/.test(name)).sort((a, b) => Number(a) - Number(b)) }
    catch { return [] }
  }
  const linux = async () => {
    const tables = await Promise.all(['/proc/net/tcp', '/proc/net/tcp6'].map(file => read(file, maxOutput)))
    const listeners = new Map(tables.flatMap(table => [...commandPortParsers.linuxTcpListeners(table)]).filter(([, port]) => requested.has(port)))
    if (!listeners.size || signal.aborted) return
    const pids = await directory('/proc', maxProcesses)
    let cursor = 0, links = 0
    await Promise.all(Array.from({ length: Math.min(8, pids.length) }, async () => {
      while (!signal.aborted && cursor < pids.length && links < maxLinks) {
        const pid = pids[cursor++]!
        const owned = new Set<number>()
        for (const descriptor of await directory(`/proc/${pid}/fd`, maxDescriptors)) {
          if (signal.aborted || links++ >= maxLinks) break
          try {
            const target = await (options.readLink ?? (file => readlink(file)))(`/proc/${pid}/fd/${descriptor}`, signal)
            const inode = /^socket:\[(\d+)\]$/.exec(target)?.[1]
            const port = inode ? listeners.get(inode) : undefined
            if (port !== undefined) owned.add(port)
          } catch { /* Descriptors may close or belong to another account. */ }
        }
        if (!owned.size || signal.aborted) continue
        const name = await read(`/proc/${pid}/comm`, 1024)
        for (const port of owned) add(port, name)
      }
    }))
  }
  const platform = async () => {
    if (signal.aborted) return
    const platform = options.platform ?? process.platform
    if (platform === 'linux') { await linux(); return }
    if (platform === 'darwin') {
      const output = await (options.run ?? run)('/usr/sbin/lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpcn'], signal)
      if (Buffer.byteLength(output) > maxOutput || signal.aborted) return
      const commands = new Map<number, string>()
      let pid = 0
      for (const line of output.split('\n')) {
        if (line.startsWith('p')) pid = /^p[1-9]\d*$/.test(line) ? Number(line.slice(1)) : 0
        else if (pid && line.startsWith('c')) commands.set(pid, line.slice(1))
      }
      for (const [pid, owned] of commandPortParsers.lsofTcpListeners(output)) {
        for (const port of owned) add(port, commands.get(pid) ?? '')
      }
    } else if (platform === 'win32') {
      const script = "$ErrorActionPreference='Stop'; $listeners=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object OwningProcess,LocalAddress,LocalPort); $processes=@(Get-Process -ErrorAction SilentlyContinue | Select-Object Id,ProcessName); @{processes=$processes;listeners=$listeners} | ConvertTo-Json -Depth 3 -Compress"
      const output = await (options.run ?? run)(powershell(), encodedPowerShell(script), signal)
      if (Buffer.byteLength(output) > maxOutput || signal.aborted) return
      const data: unknown = JSON.parse(output.replace(/^\uFEFF/, ''))
      if (!data || typeof data !== 'object' || !('processes' in data) || !Array.isArray(data.processes)) return
      const commands = new Map<number, string>()
      for (const row of data.processes) {
        if (row && Number.isInteger(row.Id) && row.Id > 0 && typeof row.ProcessName === 'string') commands.set(row.Id, row.ProcessName)
      }
      for (const [pid, owned] of commandPortParsers.windowsSnapshot(output).ports) {
        for (const port of owned) add(port, commands.get(pid) ?? '')
      }
    }
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<void>(resolve => {
    const finish = () => resolve()
    signal.addEventListener('abort', finish, { once: true })
    if (signal.aborted) finish()
    timer = setTimeout(cancel, options.timeoutMs ?? 1000)
  })
  try {
    await Promise.race([platform().catch(() => {}), expired])
    return new Map([...names].sort(([a], [b]) => a - b).map(([port, found]) => [port, Array.from([...found].sort().join(', ')).slice(0, 80).join('')]))
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', cancel)
    controller.abort()
  }
}
