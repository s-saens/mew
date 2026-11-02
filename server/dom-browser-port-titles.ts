import http from 'node:http'
import { isIP } from 'node:net'
import type { Readable } from 'node:stream'
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib'
import { parse, type DefaultTreeAdapterMap } from 'parse5'
import type { DomBrowserPort } from '../shared/dom-browser.ts'

const maxBytes = 128 * 1024
const connectionErrors = new Set(['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'EADDRNOTAVAIL'])
type PageResponse = { status: number; location?: string; body?: string }

export interface DomBrowserPortTitleOptions {
  signal?: AbortSignal
  allowedPort: (port: number) => boolean
  timeoutMs?: number
}

function requestPage(url: URL, signal: AbortSignal): Promise<PageResponse> {
  return new Promise((resolve, reject) => {
    let response: http.IncomingMessage | undefined, decoded: Readable | undefined
    let settled = false
    const finish = (error?: unknown, value?: PageResponse) => {
      if (settled) return
      settled = true
      decoded?.destroy(); response?.destroy(); request.destroy()
      if (error) reject(error)
      else resolve(value!)
    }
    const request = http.get(url, { signal, agent: false, headers: { Accept: 'text/html', 'Accept-Encoding': 'identity' } }, incoming => {
      response = incoming
      const status = incoming.statusCode ?? 0
      if ([301, 302, 303, 307, 308].includes(status)) { finish(undefined, { status, location: incoming.headers.location }); return }
      if (status < 200 || status >= 300 || !/^text\/html(?:\s*;|\s*$)/i.test(incoming.headers['content-type'] ?? '')) { finish(undefined, { status }); return }
      const encoding = incoming.headers['content-encoding']?.trim().toLowerCase()
      if (!encoding || encoding === 'identity') decoded = incoming
      else if (encoding === 'gzip') decoded = incoming.pipe(createGunzip())
      else if (encoding === 'deflate') decoded = incoming.pipe(createInflate())
      else if (encoding === 'br') decoded = incoming.pipe(createBrotliDecompress())
      else { finish(undefined, { status }); return }
      incoming.on('error', error => finish(error))
      decoded.on('error', error => finish(error))
      void (async () => {
        const chunks: Buffer[] = []
        let size = 0
        for await (const chunk of decoded!) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          size += bytes.length
          if (size > maxBytes) throw new Error('Local page exceeds the title response limit')
          chunks.push(bytes)
        }
        finish(undefined, { status, body: Buffer.concat(chunks).toString('utf8') })
      })().catch(error => finish(error))
    })
    request.on('error', error => {
      if (!response && connectionErrors.has((error as NodeJS.ErrnoException).code ?? '')) finish(Object.assign(error, { connectionFailure: true }))
      else finish(error)
    })
  })
}

function loopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '[::1]' || isIP(hostname) === 4 && hostname.startsWith('127.')
}

function pageTitle(html: string): string | undefined {
  const visit = (node: DefaultTreeAdapterMap['node']): string | undefined => {
    if ('tagName' in node && node.tagName === 'title' && node.namespaceURI === 'http://www.w3.org/1999/xhtml') {
      const title = node.childNodes.map(child => 'value' in child ? child.value : '').join('')
        .replace(/[\s\p{Cc}\p{Cf}]+/gu, ' ').trim()
      return title ? Array.from(title).slice(0, 200).join('') : undefined
    }
    if ('childNodes' in node) {
      for (const child of node.childNodes) {
        const title = visit(child)
        if (title) return title
      }
    }
  }
  return visit(parse(html))
}

async function titleForPort(port: number, signal: AbortSignal, allowedPort: (port: number) => boolean): Promise<string | undefined> {
  let url = new URL(`http://127.0.0.1:${port}/`)
  for (let redirects = 0; redirects <= 3; redirects++) {
    let result: PageResponse
    try {
      signal.throwIfAborted()
      if (!allowedPort(port)) return
      url.hostname = '127.0.0.1'
      result = await requestPage(url, signal)
    } catch (error) {
      if (!(error as { connectionFailure?: boolean }).connectionFailure || signal.aborted || !allowedPort(port)) return
      url.hostname = '[::1]'
      result = await requestPage(url, signal)
    }
    if (result.body !== undefined) return pageTitle(result.body)
    if (!result.location || redirects === 3) return
    const next = new URL(result.location, url)
    const authority = result.location.trim().replace(/[\t\r\n]/g, '').replace(/\\/g, '/').match(/^(?:[a-z][a-z\d+.-]*:)?\/{2,}([^/?#]*)/i)?.[1]
    if (next.protocol !== 'http:' || authority?.includes('@') || next.username || next.password || Number(next.port || 80) !== port || !loopback(next.hostname)) return
    url = next
  }
}

/** Read bounded, inert HTTP metadata; one failing listener never hides the port list. */
export async function enrichDomBrowserPortTitles(ports: DomBrowserPort[], options: DomBrowserPortTitleOptions): Promise<DomBrowserPort[]> {
  const enriched = [...ports]
  const controller = new AbortController()
  const abort = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) abort()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 1200)
  const candidates = ports.flatMap((entry, index) => entry.kind === 'app' && Number.isInteger(entry.port) && entry.port > 0 && entry.port <= 65535 ? [index] : []).slice(0, 32)
  let cursor = 0
  try {
    await Promise.all(Array.from({ length: Math.min(4, candidates.length) }, async () => {
      while (!controller.signal.aborted && cursor < candidates.length) {
        const index = candidates[cursor++]!, entry = ports[index]!
        const portController = new AbortController()
        const cancel = () => portController.abort()
        controller.signal.addEventListener('abort', cancel, { once: true })
        const portTimer = setTimeout(cancel, 600)
        try {
          const title = await titleForPort(entry.port, portController.signal, options.allowedPort)
          if (title && !controller.signal.aborted && options.allowedPort(entry.port)) enriched[index] = { ...entry, title }
        } catch { /* Title metadata is optional. */ }
        finally {
          clearTimeout(portTimer)
          controller.signal.removeEventListener('abort', cancel)
          portController.abort()
        }
      }
    }))
    return enriched
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
    controller.abort()
  }
}
