import { execFile } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { opendir, readlink } from 'node:fs/promises'
import { isIP } from 'node:net'
import { endianness } from 'node:os'
import { promisify } from 'node:util'
import { encodedPowerShell, powershell } from './platform/windows/storage.ts'

type CommandPane = { session: string; pid: number }
type PortSnapshot = { parents: Map<number, number>; ports: Map<number, Set<number>> }
const execute = promisify(execFile)
const scanTimeout = 5_000
const maxProcesses = 32_768
const maxDescriptors = 16_384
const maxOutput = 4 * 1024 * 1024
const maxPid = 0xffff_ffff

const validPid = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= maxPid
const validParent = (value: unknown): value is number => value === 0 || validPid(value)
const validPort = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 65_535
const emptySnapshot = (): PortSnapshot => ({ parents: new Map(), ports: new Map() })

function addPort(ports: Map<number, Set<number>>, pid: number, port: number) {
  const owned = ports.get(pid) ?? new Set<number>()
  owned.add(port)
  ports.set(pid, owned)
}

function previewAddress(address: string): boolean {
  if (address === '*' || address === '127.0.0.1' || address === '0.0.0.0') return true
  if (isIP(address) !== 6) return false
  const hostname = new URL(`http://[${address}]/`).hostname
  return hostname === '[::1]' || hostname === '[::]'
}

function linuxProcessStat(text: string): { pid: number; parent: number } | undefined {
  const identity = /^(\d+) \(/.exec(text)
  const close = text.lastIndexOf(')')
  if (!identity || close < identity[0].length) return
  const fields = /^\s+[A-Za-z]\s+(\d+)(?:\s|$)/.exec(text.slice(close + 1))
  const pid = Number(identity[1]), parent = fields ? Number(fields[1]) : NaN
  if (validPid(pid) && validParent(parent)) return { pid, parent }
}

function linuxTcpListeners(text: string, byteOrder: 'LE' | 'BE' = endianness()): Map<string, number> {
  const listeners = new Map<string, number>()
  const loopback4 = byteOrder === 'LE' ? '0100007F' : '7F000001'
  const loopback6 = byteOrder === 'LE' ? '00000000000000000000000001000000' : '00000000000000000000000000000001'
  for (const line of text.split('\n')) {
    const fields = line.trim().split(/\s+/)
    if (fields.length < 10 || !/^\d+:$/.test(fields[0]) || fields[3] !== '0A') continue
    const local = /^([0-9A-Fa-f]{8}|[0-9A-Fa-f]{32}):([0-9A-Fa-f]{4})$/.exec(fields[1])
    if (!local || !/^[1-9]\d*$/.test(fields[9])) continue
    const address = local[1].toUpperCase(), port = parseInt(local[2], 16)
    if (validPort(port) && (/^0+$/.test(address) || address === loopback4 || address === loopback6)) listeners.set(fields[9], port)
  }
  return listeners
}

function posixProcessParents(text: string): Map<number, number> {
  const parents = new Map<number, number>()
  for (const line of text.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(line)
    if (!match) continue
    const pid = Number(match[1]), parent = Number(match[2])
    if (validPid(pid) && validParent(parent)) parents.set(pid, parent)
  }
  return parents
}

function lsofTcpListeners(text: string): Map<number, Set<number>> {
  const ports = new Map<number, Set<number>>()
  let pid = 0
  for (const line of text.split('\n')) {
    if (line.startsWith('p')) {
      const value = /^p(\d+)$/.exec(line)
      pid = value && validPid(Number(value[1])) ? Number(value[1]) : 0
    } else if (pid && line.startsWith('n')) {
      const name = /^n(?:\[([^\]]+)\]|([^:]+)):(\d+)$/.exec(line)
      const port = name ? Number(name[3]) : NaN
      if (name && validPort(port) && previewAddress(name[1] ?? name[2])) addPort(ports, pid, port)
    }
  }
  return ports
}

function windowsSnapshot(text: string): PortSnapshot {
  const snapshot = emptySnapshot()
  try {
    const result: unknown = JSON.parse(text.replace(/^\uFEFF/, ''))
    if (!result || typeof result !== 'object' || Array.isArray(result)) return snapshot
    const data = result as { processes?: unknown; listeners?: unknown }
    if (!Array.isArray(data.processes) || !Array.isArray(data.listeners)) return snapshot
    for (const row of data.processes) {
      if (row && validPid(row.ProcessId) && validParent(row.ParentProcessId)) snapshot.parents.set(row.ProcessId, row.ParentProcessId)
    }
    for (const row of data.listeners) {
      if (row && validPid(row.OwningProcess) && validPort(row.LocalPort) && typeof row.LocalAddress === 'string' && previewAddress(row.LocalAddress)) addPort(snapshot.ports, row.OwningProcess, row.LocalPort)
    }
  } catch { /* Missing tools, permissions, and invalid snapshots leave command buttons usable. */ }
  return snapshot
}

// The platform parsers are pure so non-host platforms can be checked without running their tools.
export const commandPortParsers = { linuxProcessStat, linuxTcpListeners, posixProcessParents, lsofTcpListeners, windowsSnapshot }

function processChildren(parents: Map<number, number>): Map<number, number[]> {
  const children = new Map<number, number[]>()
  for (const [pid, parent] of parents) {
    const owned = children.get(parent) ?? []
    owned.push(pid)
    children.set(parent, owned)
  }
  return children
}

function descendants(roots: number[], parents: Map<number, number>, children: Map<number, number[]>): Set<number> {
  const found = new Set<number>()
  const pending = roots.filter(pid => parents.has(pid))
  while (pending.length) {
    const pid = pending.pop()!
    if (found.has(pid)) continue
    found.add(pid)
    pending.push(...children.get(pid) ?? [])
  }
  return found
}

async function directoryNames(directory: string, limit: number, signal: AbortSignal): Promise<string[]> {
  const names: string[] = []
  try {
    for await (const entry of await opendir(directory)) {
      if (signal.aborted || names.length >= limit) break
      if (/^\d+$/.test(entry.name)) names.push(entry.name)
    }
  } catch { /* Processes may exit while their descriptors are being read. */ }
  return names
}

async function boundedText(file: string, limit: number, signal: AbortSignal): Promise<string> {
  try {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of createReadStream(file, { signal, highWaterMark: 16 * 1024 })) {
      size += chunk.length
      if (size > limit) return ''
      chunks.push(chunk)
    }
    return Buffer.concat(chunks).toString('utf8')
  } catch { return '' }
}

async function eachLimited<T>(values: T[], signal: AbortSignal, visit: (value: T) => Promise<void>) {
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(32, values.length) }, async () => {
    while (!signal.aborted && cursor < values.length) await visit(values[cursor++])
  }))
}

async function linuxSnapshot(panes: CommandPane[], signal: AbortSignal): Promise<PortSnapshot> {
  const snapshot = emptySnapshot()
  const processes = await directoryNames('/proc', maxProcesses, signal)
  await eachLimited(processes, signal, async entry => {
    const stat = linuxProcessStat(await boundedText(`/proc/${entry}/stat`, 16 * 1024, signal))
    if (stat && stat.pid === Number(entry)) snapshot.parents.set(stat.pid, stat.parent)
  })
  const targets = descendants(panes.map(pane => pane.pid), snapshot.parents, processChildren(snapshot.parents))
  if (!targets.size || signal.aborted) return snapshot
  const tables = await Promise.all(['/proc/net/tcp', '/proc/net/tcp6'].map(file => boundedText(file, maxOutput, signal)))
  const listeners = new Map(tables.flatMap(table => [...linuxTcpListeners(table)]))
  if (!listeners.size) return snapshot
  await eachLimited([...targets], signal, async pid => {
    const descriptors = await directoryNames(`/proc/${pid}/fd`, maxDescriptors, signal)
    for (const descriptor of descriptors) {
      if (signal.aborted) break
      try {
        const link = await readlink(`/proc/${pid}/fd/${descriptor}`)
        const inode = /^socket:\[(\d+)\]$/.exec(link)?.[1]
        const port = inode ? listeners.get(inode) : undefined
        if (port !== undefined) addPort(snapshot.ports, pid, port)
      } catch { /* An FD may close between the directory snapshot and readlink. */ }
    }
  })
  return snapshot
}

async function run(command: string, args: string[], signal: AbortSignal): Promise<string> {
  const { stdout } = await execute(command, args, { encoding: 'utf8', timeout: scanTimeout, maxBuffer: maxOutput, signal, killSignal: 'SIGKILL', windowsHide: true })
  return stdout
}

async function platformSnapshot(panes: CommandPane[], signal: AbortSignal): Promise<PortSnapshot> {
  if (process.platform === 'linux') return linuxSnapshot(panes, signal)
  if (process.platform === 'darwin') {
    const [processes, listeners] = await Promise.all([
      run('/bin/ps', ['-axo', 'pid=,ppid='], signal),
      run('/usr/sbin/lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn'], signal),
    ])
    return { parents: posixProcessParents(processes), ports: lsofTcpListeners(listeners) }
  }
  if (process.platform === 'win32') {
    const script = "$ErrorActionPreference='Stop'; $processes=@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId); $listeners=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object OwningProcess,LocalAddress,LocalPort); @{processes=$processes;listeners=$listeners} | ConvertTo-Json -Depth 3 -Compress"
    return windowsSnapshot(await run(powershell(), encodedPowerShell(script), signal))
  }
  return emptySnapshot()
}

/** Match a batch of command panes to their own live localhost TCP listeners. */
export async function commandSessionPorts(panes: Array<{ session: string; pid: number }>): Promise<Map<string, number[]>> {
  const empty = new Map(panes.map(pane => [pane.session, [] as number[]]))
  const valid = panes.filter(pane => pane.session && validPid(pane.pid))
  if (!valid.length) return empty
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<Map<string, number[]>>(resolve => {
    timer = setTimeout(() => { controller.abort(); resolve(empty) }, scanTimeout)
  })
  try {
    const scan = async () => {
      const snapshot = await platformSnapshot(valid, controller.signal)
      const children = processChildren(snapshot.parents)
      const sessions = new Map<string, Set<number>>()
      for (const pane of valid) {
        const ports = sessions.get(pane.session) ?? new Set<number>()
        for (const pid of descendants([pane.pid], snapshot.parents, children)) {
          for (const port of snapshot.ports.get(pid) ?? []) ports.add(port)
        }
        sessions.set(pane.session, ports)
      }
      return new Map([...empty].map(([session]) => [session, [...sessions.get(session) ?? []].sort((a, b) => a - b)]))
    }
    return await Promise.race([scan(), expired])
  } catch { return empty }
  finally { clearTimeout(timer); controller.abort() }
}
