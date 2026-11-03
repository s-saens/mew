import { execFile } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { promisify } from 'node:util'
import express from 'express'
import type { DomBrowserPort } from '../shared/dom-browser.ts'
import { canUse } from './access-policy.ts'
import { commandPortParsers } from './command-ports.ts'
import { authOf } from './reqAuth.ts'
import { enrichDomBrowserPortTitles } from './dom-browser-port-titles.ts'
import { discoverDomBrowserPortProcesses } from './dom-browser-port-processes.ts'
import { encodedPowerShell, powershell } from './platform/windows/storage.ts'

const execute = promisify(execFile)
const scanTimeout = 5_000
const maxOutput = 4 * 1024 * 1024
const validPort = (port: number) => Number.isInteger(port) && port > 0 && port <= 65_535
const sortedPorts = (ports: Iterable<number>) => [...new Set([...ports].filter(validPort))].sort((a, b) => a - b)

type ReadText = (file: string, signal: AbortSignal) => Promise<string>
type Run = (command: string, args: string[], signal: AbortSignal) => Promise<string>

export interface DomBrowserPortDiscoveryOptions {
  platform?: NodeJS.Platform
  signal?: AbortSignal
  timeoutMs?: number
  readText?: ReadText
  run?: Run
}

export interface DomBrowserPortsOptions {
  mewPorts: () => ReadonlySet<number>
  blockedPorts?: () => ReadonlySet<number>
  scan?: (signal: AbortSignal) => Promise<number[]>
  titles?: typeof enrichDomBrowserPortTitles
  processes?: typeof discoverDomBrowserPortProcesses
  timeoutMs?: number
}

async function boundedText(file: string, signal: AbortSignal): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of createReadStream(file, { signal, highWaterMark: 16 * 1024 })) {
    size += chunk.length
    if (size > maxOutput) throw new Error('Local socket table exceeds the scan limit')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function run(command: string, args: string[], signal: AbortSignal): Promise<string> {
  try {
    const { stdout } = await execute(command, args, { encoding: 'utf8', timeout: scanTimeout, maxBuffer: maxOutput, signal, killSignal: 'SIGKILL', windowsHide: true })
    return stdout
  } catch (error) {
    const failure = error as { code?: string | number; stdout?: string; stderr?: string }
    // lsof reports no matching sockets with status 1 and no diagnostic output.
    if (command === '/usr/sbin/lsof' && failure.code === 1 && failure.stdout === '' && failure.stderr === '') return ''
    throw error
  }
}

async function timedScan<T>(scan: (signal: AbortSignal) => Promise<T>, timeoutMs: number, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController()
  const abort = () => controller.abort(parent?.reason)
  parent?.addEventListener('abort', abort, { once: true })
  if (parent?.aborted) abort()
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<never>((_resolve, reject) => {
    const fail = () => reject(new Error('Local port scan was cancelled'))
    controller.signal.addEventListener('abort', fail, { once: true })
    if (controller.signal.aborted) fail()
    timer = setTimeout(() => controller.abort(), timeoutMs)
  })
  try {
    return await Promise.race([scan(controller.signal), expired])
  } finally {
    clearTimeout(timer)
    parent?.removeEventListener('abort', abort)
    controller.abort()
  }
}

function linuxPorts(text: string): number[] {
  if (!/^\s*sl\s+local_address\s+rem(?:ote)?_address\s+st\s/m.test(text)) throw new Error('Invalid local socket table')
  return [...commandPortParsers.linuxTcpListeners(text).values()]
}

function macPorts(text: string): number[] {
  if (text.trim() && !/^p[1-9]\d*$/m.test(text)) throw new Error('Invalid local socket listing')
  return [...commandPortParsers.lsofTcpListeners(text).values()].flatMap(ports => [...ports])
}

function windowsPorts(text: string): number[] {
  const value: unknown = JSON.parse(text.replace(/^\uFEFF/, ''))
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray((value as { listeners?: unknown }).listeners)) {
    throw new Error('Invalid local socket listing')
  }
  const snapshot = commandPortParsers.windowsSnapshot(JSON.stringify({ processes: [], listeners: (value as { listeners: unknown[] }).listeners }))
  return [...snapshot.ports.values()].flatMap(ports => [...ports])
}

export const domBrowserPortParsers = { linuxPorts, macPorts, windowsPorts }

/** Read live host listeners without connecting to any service or inspecting command sessions. */
export async function discoverDomBrowserPorts(options: DomBrowserPortDiscoveryOptions = {}): Promise<number[]> {
  const read = options.readText ?? boundedText, executeTool = options.run ?? run
  return timedScan(async signal => {
    const platform = options.platform ?? process.platform
    if (platform === 'linux') {
      const tables = await Promise.all(['/proc/net/tcp', '/proc/net/tcp6'].map(async file => {
        try { return linuxPorts(await read(file, signal)) }
        catch (error) {
          if (file.endsWith('tcp6') && (error as NodeJS.ErrnoException).code === 'ENOENT') return []
          throw error
        }
      }))
      return sortedPorts(tables.flat())
    }
    if (platform === 'darwin') return sortedPorts(macPorts(await executeTool('/usr/sbin/lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn'], signal)))
    if (platform === 'win32') {
      const script = "$ErrorActionPreference='Stop'; $listeners=@(Get-NetTCPConnection -State Listen -ErrorAction Stop | Select-Object OwningProcess,LocalAddress,LocalPort); @{listeners=$listeners} | ConvertTo-Json -Depth 3 -Compress"
      return sortedPorts(windowsPorts(await executeTool(powershell(), encodedPowerShell(script), signal)))
    }
    throw new Error('Local port discovery is unavailable on this platform')
  }, options.timeoutMs ?? scanTimeout, options.signal)
}

/** Mount at /api/dom-browser alongside its existing WebSocket endpoint. */
export function createDomBrowserPortsRouter(options: DomBrowserPortsOptions) {
  const router = express.Router()
  router.get('/ports', async (req, res) => {
    const original = authOf(req)
    const allowed = () => {
      const auth = authOf(req)
      return !!original.email && auth.email === original.email && !auth.mustChangePassword && canUse(auth, 'portPreview')
    }
    if (!allowed()) { res.status(403).json({ error: '이 기능을 사용할 권한이 없습니다' }); return }
    res.setHeader('Cache-Control', 'no-store')
    const cancellation = new AbortController()
    const cancel = () => cancellation.abort()
    res.once('close', cancel)
    try {
      const discovered = await timedScan(options.scan ?? (signal => discoverDomBrowserPorts({ signal })), options.timeoutMs ?? scanTimeout, cancellation.signal)
      if (!allowed()) { res.status(403).json({ error: '이 기능을 사용할 권한이 없습니다' }); return }
      const kindOf = (port: number): DomBrowserPort['kind'] => options.mewPorts().has(port) ? 'mew' : options.blockedPorts?.().has(port) ? 'blocked' : 'app'
      const ports = sortedPorts(discovered).map<DomBrowserPort>(port => ({ port, kind: kindOf(port) }))
      const [titled, processes] = await Promise.all([
        (options.titles ?? enrichDomBrowserPortTitles)(ports, {
          signal: cancellation.signal,
          allowedPort: port => allowed() && kindOf(port) === 'app',
        }),
        (options.processes ?? discoverDomBrowserPortProcesses)(ports.filter(entry => entry.kind !== 'mew').map(entry => entry.port), { signal: cancellation.signal }).catch(() => new Map<number, string>()),
      ])
      if (!allowed()) { res.status(403).json({ error: '이 기능을 사용할 권한이 없습니다' }); return }
      if (res.destroyed) return
      res.json({ ports: titled.map(entry => {
        const kind = kindOf(entry.port)
        if (kind === 'mew') return { port: entry.port, kind }
        const result: DomBrowserPort = kind === 'app' ? entry : { port: entry.port, kind }
        const processName = processes.get(entry.port)
        return processName ? { ...result, processName } : result
      }) })
    } catch {
      if (!res.destroyed) res.status(503).json({ error: '열린 포트를 불러오지 못했습니다. 다시 시도해 주세요.', code: 'dom-browser-ports-unavailable' })
    } finally {
      res.off('close', cancel)
      cancellation.abort()
    }
  })
  return router
}
