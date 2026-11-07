import { execFile } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { opendir, readlink } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { commandPortParsers } from './command-ports.ts'
import { encodedPowerShell, powershell } from './platform/windows/storage.ts'

const execute = promisify(execFile)
const maxOutput = 4 * 1024 * 1024
const maxProcesses = 32_768
const maxDescriptors = 16_384
const maxLinks = 262_144
const validPid = (pid: number) => Number.isInteger(pid) && pid > 0 && pid <= 0xffff_ffff

export type DomBrowserPortCloseCode = 'dom-browser-port-close-forbidden' | 'dom-browser-port-invalid' | 'dom-browser-port-protected' | 'dom-browser-port-owners-unavailable' | 'dom-browser-port-close-failed' | 'dom-browser-port-still-open' | 'dom-browser-port-close-unavailable'

export class DomBrowserPortCloseError extends Error {
  readonly code: DomBrowserPortCloseCode
  readonly status: number
  constructor(code: DomBrowserPortCloseCode, status: number) {
    super(code)
    this.code = code
    this.status = status
  }
}

export interface DomBrowserPortOwnerSnapshot {
  listening: boolean
  owners: Set<number>
  protectedPids: Set<number>
  parents: Map<number, number>
  identities: Map<number, string>
}

interface SnapshotOptions {
  platform?: NodeJS.Platform
  readText?: (file: string, signal: AbortSignal) => Promise<string>
  directoryNames?: (directory: string, limit: number, signal: AbortSignal) => Promise<string[]>
  readLink?: (file: string) => Promise<string>
  run?: (command: string, args: string[], signal: AbortSignal) => Promise<string>
}

export interface DomBrowserPortCloseOptions {
  protectedPorts: () => ReadonlySet<number>
  allowed: () => boolean
  signal?: AbortSignal
  snapshot?: (port: number, protectedPorts: ReadonlySet<number>, signal: AbortSignal) => Promise<DomBrowserPortOwnerSnapshot>
  signalProcess?: (pid: number, signal: 'SIGTERM') => void
  selfPid?: number
  timeoutMs?: number
  waitMs?: number
  pollMs?: number
}

const unavailable = () => new DomBrowserPortCloseError('dom-browser-port-owners-unavailable', 503)
const emptySnapshot = (): DomBrowserPortOwnerSnapshot => ({ listening: false, owners: new Set(), protectedPids: new Set(), parents: new Map(), identities: new Map() })
const gone = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ESRCH'

async function boundedText(file: string, signal: AbortSignal): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of createReadStream(file, { signal, highWaterMark: 16 * 1024 })) {
    if ((size += chunk.length) > maxOutput) throw unavailable()
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function directoryNames(directory: string, limit: number, signal: AbortSignal): Promise<string[]> {
  const names: string[] = []
  for await (const entry of await opendir(directory)) {
    signal.throwIfAborted()
    if (!/^\d+$/.test(entry.name)) continue
    if (names.length >= limit) throw unavailable()
    names.push(entry.name)
  }
  return names
}

async function run(command: string, args: string[], signal: AbortSignal): Promise<string> {
  try {
    const { stdout } = await execute(command, args, { encoding: 'utf8', timeout: 5000, maxBuffer: maxOutput, signal, windowsHide: true })
    return stdout
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string }
    if (command === '/usr/sbin/lsof' && failure.code === 1 && failure.stdout === '' && failure.stderr === '') return ''
    throw error
  }
}

function assignOwners(result: DomBrowserPortOwnerSnapshot, port: number, protectedPorts: ReadonlySet<number>, local: Map<number, Set<number>>, all: Map<number, Set<number>>) {
  for (const [pid, ports] of local) if (ports.has(port)) { result.listening = true; result.owners.add(pid) }
  for (const [pid, ports] of all) if ([...ports].some(value => protectedPorts.has(value))) result.protectedPids.add(pid)
}

/** Resolve actual socket owners. Incomplete target ownership fails closed rather than guessing a PID. */
export async function discoverDomBrowserPortOwners(port: number, protectedPorts: ReadonlySet<number>, signal: AbortSignal, options: SnapshotOptions = {}): Promise<DomBrowserPortOwnerSnapshot> {
  signal.throwIfAborted()
  const result = emptySnapshot()
  const read = options.readText ?? boundedText
  const directory = options.directoryNames ?? directoryNames
  const executeTool = options.run ?? run
  const platform = options.platform ?? process.platform
  if (platform === 'linux') {
    const tables = await Promise.all(['/proc/net/tcp', '/proc/net/tcp6'].map(async file => {
      try { return await read(file, signal) }
      catch (error) { if (file.endsWith('tcp6') && gone(error)) return ''; throw error }
    }))
    for (const table of tables) if (table && !/^\s*sl\s+local_address\s+rem(?:ote)?_address\s+st\s/m.test(table)) throw unavailable()
    if (!tables[0]) throw unavailable()
    const local = new Map(tables.flatMap(table => [...commandPortParsers.linuxTcpListeners(table)]))
    const targets = new Set([...local].filter(([, found]) => found === port).map(([inode]) => inode))
    result.listening = targets.size > 0
    if (!result.listening) return result
    const protectedInodes = new Set<string>()
    for (const table of tables) for (const line of table.split('\n')) {
      const fields = line.trim().split(/\s+/)
      const address = /^([\da-f]{8}|[\da-f]{32}):([\da-f]{4})$/i.exec(fields[1] ?? '')
      if (fields[3] === '0A' && address && /^[1-9]\d*$/.test(fields[9] ?? '') && protectedPorts.has(parseInt(address[2], 16))) protectedInodes.add(fields[9])
    }
    const found = new Set<string>()
    const pids = await directory('/proc', maxProcesses, signal)
    if (pids.length > maxProcesses) throw unavailable()
    let cursor = 0, links = 0
    await Promise.all(Array.from({ length: Math.min(8, pids.length) }, async () => {
      while (cursor < pids.length) {
        signal.throwIfAborted()
        const entry = pids[cursor++]
        if (!/^[1-9]\d*$/.test(entry)) continue
        const pid = Number(entry)
        try {
          const stat = await read(`/proc/${pid}/stat`, signal)
          const identity = commandPortParsers.linuxProcessStat(stat)
          if (identity?.pid === pid) {
            result.parents.set(pid, identity.parent)
            const started = stat.slice(stat.lastIndexOf(')') + 1).trim().split(/\s+/)[19]
            if (/^\d+$/.test(started ?? '')) result.identities.set(pid, started)
          }
        } catch (error) { if (!gone(error) && (error as NodeJS.ErrnoException).code !== 'EACCES') throw error }
        let descriptors: string[]
        try { descriptors = await directory(`/proc/${pid}/fd`, maxDescriptors, signal) }
        catch (error) { if (gone(error) || ['EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) continue; throw error }
        if (descriptors.length > maxDescriptors) throw unavailable()
        for (const fd of descriptors) {
          signal.throwIfAborted()
          if (!/^\d+$/.test(fd)) continue
          if (++links > maxLinks) throw unavailable()
          let link: string
          try { link = await (options.readLink ?? readlink)(`/proc/${pid}/fd/${fd}`) }
          catch (error) { if (gone(error) || ['EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) continue; throw error }
          const inode = /^socket:\[(\d+)\]$/.exec(link)?.[1]
          if (!inode) continue
          if (targets.has(inode)) { result.owners.add(pid); found.add(inode) }
          if (protectedInodes.has(inode)) result.protectedPids.add(pid)
        }
      }
    }))
    if ([...targets].some(inode => !found.has(inode)) || [...result.owners].some(pid => !result.identities.has(pid))) throw unavailable()
  } else if (platform === 'darwin') {
    const [processes, listeners] = await Promise.all([
      executeTool('/bin/ps', ['-axo', 'pid=,ppid=,lstart='], signal),
      executeTool('/usr/sbin/lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn'], signal),
    ])
    if (listeners.trim() && !/^p[1-9]\d*$/m.test(listeners)) throw unavailable()
    for (const line of processes.split('\n')) {
      const match = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line)
      if (match && validPid(Number(match[1]))) { result.parents.set(Number(match[1]), Number(match[2])); result.identities.set(Number(match[1]), match[3]) }
    }
    const local = commandPortParsers.lsofTcpListeners(listeners)
    const all = new Map<number, Set<number>>()
    let pid = 0
    for (const line of listeners.split('\n')) {
      if (line.startsWith('p')) pid = /^p[1-9]\d*$/.test(line) ? Number(line.slice(1)) : 0
      const match = pid && /^n.+:(\d+)$/.exec(line)
      if (match) { const ports = all.get(pid) ?? new Set<number>(); ports.add(Number(match[1])); all.set(pid, ports) }
    }
    assignOwners(result, port, protectedPorts, local, all)
  } else if (platform === 'win32') {
    const script = "$ErrorActionPreference='Stop'; $processes=@(Get-CimInstance Win32_Process -ErrorAction Stop | Select-Object ProcessId,ParentProcessId,CreationDate); $listeners=@(Get-NetTCPConnection -State Listen -ErrorAction Stop | Select-Object OwningProcess,LocalAddress,LocalPort); @{processes=$processes;listeners=$listeners} | ConvertTo-Json -Depth 3 -Compress"
    const output = await executeTool(powershell(), encodedPowerShell(script), signal)
    const value: unknown = JSON.parse(output.replace(/^\uFEFF/, ''))
    if (!value || typeof value !== 'object' || !('processes' in value) || !Array.isArray(value.processes) || !('listeners' in value) || !Array.isArray(value.listeners)) throw unavailable()
    const snapshot = commandPortParsers.windowsSnapshot(output)
    result.parents = snapshot.parents
    for (const row of value.processes) if (row && validPid(row.ProcessId) && row.CreationDate != null) result.identities.set(row.ProcessId, String(row.CreationDate))
    const all = new Map<number, Set<number>>()
    for (const row of value.listeners) if (row && validPid(row.OwningProcess) && Number.isInteger(row.LocalPort)) {
      const ports = all.get(row.OwningProcess) ?? new Set<number>()
      ports.add(row.LocalPort); all.set(row.OwningProcess, ports)
    }
    assignOwners(result, port, protectedPorts, snapshot.ports, all)
  } else throw unavailable()
  signal.throwIfAborted()
  return result
}

function safeOwners(snapshot: DomBrowserPortOwnerSnapshot, selfPid: number): Set<number> {
  if (!snapshot.owners.size) throw unavailable()
  const protectedPids = new Set([1, selfPid, ...snapshot.protectedPids])
  let ancestor = selfPid
  const visited = new Set<number>()
  while (ancestor > 1) {
    if (visited.has(ancestor)) throw unavailable()
    visited.add(ancestor)
    const parent = snapshot.parents.get(ancestor)
    if (parent == null || !Number.isInteger(parent) || parent < 0) throw unavailable()
    if (parent) protectedPids.add(parent)
    ancestor = parent
  }
  for (const pid of snapshot.owners) {
    if (!validPid(pid) || !snapshot.identities.has(pid)) throw unavailable()
    if (protectedPids.has(pid)) throw new DomBrowserPortCloseError('dom-browser-port-protected', 409)
  }
  return snapshot.owners
}

/** Stop only current listener owners, with live permission/policy checks immediately before each SIGTERM. */
export async function closeDomBrowserPort(port: number, options: DomBrowserPortCloseOptions): Promise<{ port: number; closed: true }> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new DomBrowserPortCloseError('dom-browser-port-invalid', 400)
  const controller = new AbortController()
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) abort()
  let timer: ReturnType<typeof setTimeout> | undefined
  const check = () => {
    controller.signal.throwIfAborted()
    if (!options.allowed()) throw new DomBrowserPortCloseError('dom-browser-port-close-forbidden', 403)
    if (options.protectedPorts().has(port)) throw new DomBrowserPortCloseError('dom-browser-port-protected', 409)
  }
  const snapshot = async () => {
    check()
    const value = await (options.snapshot ?? discoverDomBrowserPortOwners)(port, options.protectedPorts(), controller.signal)
    check()
    return value
  }
  const operation = async () => {
    const initial = await snapshot()
    if (!initial.listening) return { port, closed: true as const }
    const owners = safeOwners(initial, options.selfPid ?? process.pid)
    for (const pid of owners) {
      const current = await snapshot()
      if (!current.listening) return { port, closed: true as const }
      const liveOwners = safeOwners(current, options.selfPid ?? process.pid)
      if ([...liveOwners].some(owner => !owners.has(owner) || initial.identities.get(owner) !== current.identities.get(owner))) throw unavailable()
      if (!liveOwners.has(pid)) continue
      check()
      try { (options.signalProcess ?? ((target, signal) => { process.kill(target, signal) }))(pid, 'SIGTERM') }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw new DomBrowserPortCloseError('dom-browser-port-close-failed', 503) }
    }
    const deadline = Date.now() + (options.waitMs ?? 1000)
    let current = await snapshot()
    while (current.listening && Date.now() < deadline) {
      await delay(options.pollMs ?? 50, undefined, { signal: controller.signal })
      current = await snapshot()
    }
    if (!current.listening) return { port, closed: true as const }
    throw new DomBrowserPortCloseError('dom-browser-port-still-open', 409)
  }
  const expired = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener('abort', () => reject(new DomBrowserPortCloseError('dom-browser-port-close-unavailable', 503)), { once: true })
    if (controller.signal.aborted) reject(new DomBrowserPortCloseError('dom-browser-port-close-unavailable', 503))
    timer = setTimeout(abort, options.timeoutMs ?? 5000)
  })
  try { return await Promise.race([operation(), expired]) }
  catch (error) { if (error instanceof DomBrowserPortCloseError) throw error; throw unavailable() }
  finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); controller.abort() }
}
