import { randomBytes } from 'node:crypto'
import { lookup as lookupAddress } from 'node:dns/promises'
import fs from 'node:fs/promises'
import https from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, printParseErrorCode } from 'jsonc-parser'
import { parse as parseHtml } from 'parse5'

const defaultConfig = fileURLToPath(new URL('../mewlink/wrangler.jsonc', import.meta.url))
const hostnamePattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/
const scriptPaths = ['/__mew_preview_worker.js', '/__mew_preview_launch.js', '/__mew_preview_runtime.js']

function bounded(operation, timeoutMs) {
  let timer
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`${timeoutMs}ms timeout`), { code: 'ETIMEDOUT' })), timeoutMs)
  })
  return Promise.race([Promise.resolve().then(operation), deadline]).finally(() => clearTimeout(timer))
}

function requestHttps(url, { timeoutMs }) {
  return new Promise((resolve, reject) => {
    let timer
    const request = https.get(url, { rejectUnauthorized: true }, response => {
      const chunks = []
      let bytes = 0
      response.on('data', chunk => {
        bytes += chunk.length
        if (bytes > 1024 * 1024) request.destroy(new Error('Preview response exceeds 1 MiB'))
        else chunks.push(chunk)
      })
      response.on('error', reject)
      response.on('end', () => resolve({ statusCode: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }))
    })
    timer = setTimeout(() => request.destroy(Object.assign(new Error(`${timeoutMs}ms HTTPS timeout`), { code: 'ETIMEDOUT' })), timeoutMs)
    request.on('error', reject)
    request.on('close', () => clearTimeout(timer))
  })
}

function header(response, name) {
  if (typeof response.headers?.get === 'function') return response.headers.get(name) ?? ''
  return String(Object.entries(response.headers ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? '')
}

function htmlElements(html) {
  const elements = []
  const visit = node => {
    if (node.tagName) elements.push(node)
    for (const child of node.childNodes ?? []) visit(child)
  }
  visit(parseHtml(html))
  return elements
}

function attribute(element, name) {
  return element.attrs?.find(attr => attr.name === name)?.value
}

function networkStage(error) {
  const codes = []
  for (let cause = error; cause; cause = cause.cause) codes.push(cause.code ?? '')
  if (codes.some(code => /CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER/.test(code))) return 'tls'
  if (codes.some(code => ['ENOTFOUND', 'EAI_AGAIN', 'ENODATA'].includes(code))) return 'dns'
  return 'route'
}

function dnsHelp(domain, centralHostname) {
  const name = domain.endsWith(`.${centralHostname}`) ? `*.${domain.slice(0, -centralHostname.length - 1)}` : `*.${domain}`
  return `Cloudflare DNS 레코드: CNAME, 이름 ${name}, 대상 ${centralHostname}, Proxied(주황 구름). Worker 배포만으로 DNS 레코드는 생성되지 않습니다.`
}

export async function checkPortPreviewReadiness({
  configPath = defaultConfig,
  timeoutMs = 8000,
  readFile = fs.readFile,
  lookup = lookupAddress,
  request = requestHttps,
  randomHost = () => randomBytes(16).toString('hex'),
} = {}) {
  const result = { status: 'failed', previewDomain: null, appOrigin: null, hosts: [], checks: [], errors: [] }
  let centralHostname = 'mew.run'
  const record = (stage, ok, message, details = {}) => {
    const check = { stage, ok, message, ...details }
    result.checks.push(check)
    if (!ok) result.errors.push(check)
  }
  let config
  try {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs는 0보다 큰 유한한 수여야 합니다.')
    const errors = []
    config = parse(await bounded(() => readFile(configPath, 'utf8'), timeoutMs), errors, { allowTrailingComma: true })
    if (errors.length) throw new Error(errors.map(error => printParseErrorCode(error.error)).join(', '))
    const value = config?.vars?.PREVIEW_DOMAIN
    if (value === undefined || value === null || value === '') {
      result.status = 'skipped'
      record('config', true, 'PREVIEW_DOMAIN이 비활성화되어 포트 프리뷰 준비 검사를 건너뜁니다.')
      return result
    }
    if (typeof value !== 'string' || !hostnamePattern.test(value.toLowerCase())) throw new Error('PREVIEW_DOMAIN은 유효한 DNS 도메인이어야 합니다.')
    result.previewDomain = value.toLowerCase()
    const appUrl = new URL(config.vars.APP_ORIGIN)
    if (appUrl.protocol !== 'https:' || appUrl.origin !== config.vars.APP_ORIGIN) throw new Error('APP_ORIGIN은 경로·인증정보 없는 HTTPS origin이어야 합니다.')
    result.appOrigin = appUrl.origin
    const centralUrl = new URL(config.vars.CENTRAL_ORIGIN ?? 'https://mew.run')
    centralHostname = centralUrl.hostname
    if ([appUrl.hostname, centralHostname].some(hostname => hostname === result.previewDomain || hostname.endsWith(`.${result.previewDomain}`))) throw new Error('PREVIEW_DOMAIN은 중앙·앱 origin과 격리되어야 합니다.')
    const labels = [randomHost(), randomHost()]
    if (labels.some(label => !/^[a-f0-9]{32}$/.test(label)) || labels[0] === labels[1]) throw new Error('서로 다른 32자리 16진수 프리뷰 호스트 두 개가 필요합니다.')
    result.hosts = labels.map(label => `${label}.${result.previewDomain}`)
  } catch (error) {
    record('config', false, `프리뷰 설정을 읽지 못했습니다: ${error.message}`)
    return result
  }

  await Promise.all(result.hosts.map(async hostname => {
    try {
      const addresses = await bounded(() => lookup(hostname, { all: true }), timeoutMs)
      if (!addresses || (Array.isArray(addresses) && addresses.length === 0)) throw new Error('DNS 응답에 IP 주소가 없습니다.')
      record('dns', true, `${hostname}: DNS 확인`, { hostname })
    } catch (error) {
      record('dns', false, `${hostname}: DNS 조회 실패 (${error.code ?? error.message}). ${dnsHelp(result.previewDomain, centralHostname)}`, { hostname })
    }
  }))
  if (result.errors.length) return result

  const fetchResponse = async url => {
    try {
      return await bounded(() => request(url, { timeoutMs }), timeoutMs)
    } catch (error) {
      const stage = networkStage(error)
      const guidance = stage === 'tls'
        ? `*.${result.previewDomain}을 포함하는 활성 HTTPS 인증서가 필요합니다. *.${centralHostname} 인증서만으로 중첩 하위 도메인은 보호되지 않습니다.`
        : stage === 'dns' ? dnsHelp(result.previewDomain, centralHostname) : 'Worker 경로·공개 HTTPS 연결을 확인하세요.'
      record(stage, false, `${url}: ${stage.toUpperCase()} 연결 실패 (${error.code ?? error.message}). ${guidance}`, { url })
      return null
    }
  }

  await Promise.all(result.hosts.map(async hostname => {
    const url = `https://${hostname}/__mew_preview_launch`
    const response = await fetchResponse(url)
    if (!response) return
    if (response.statusCode !== 200) {
      record('route', false, `${url}: HTTP ${response.statusCode}; *.${result.previewDomain}/* Worker 경로에서 리디렉션 없이 HTTP 200을 반환해야 합니다.`, { url })
      return
    }
    if (!/^text\/html(?:\s*;|$)/i.test(header(response, 'content-type'))) {
      record('route', false, `${url}: 프리뷰 launcher가 HTML로 제공되지 않습니다. Worker 경로를 확인하세요.`, { url })
      return
    }
    const elements = htmlElements(response.body ?? '')
    const parent = elements.find(element => element.tagName === 'meta' && attribute(element, 'name') === 'mew-preview-parent')
    const launchScript = elements.some(element => element.tagName === 'script' && attribute(element, 'src') === '/__mew_preview_launch.js')
    if (attribute(parent ?? {}, 'content') !== result.appOrigin || !launchScript) {
      record('route', false, `${url}: mew-preview-parent=${result.appOrigin} 또는 프리뷰 launcher 스크립트가 없습니다. 배포된 Worker·APP_ORIGIN을 확인하세요.`, { url })
      return
    }
    record('route', true, `${hostname}: HTTPS·프리뷰 launcher 확인`, { url })
  }))
  if (result.errors.length) return result

  await Promise.all(scriptPaths.map(async scriptPath => {
    const url = `https://${result.hosts[0]}${scriptPath}`
    const response = await fetchResponse(url)
    if (!response) return
    if (response.statusCode !== 200 || !/^(?:text|application)\/(?:javascript|ecmascript)(?:\s*;|$)/i.test(header(response, 'content-type')) || !response.body?.trim() || /^\s*</.test(response.body)) {
      record('assets', false, `${url}: JavaScript 자산이 없거나 올바르지 않습니다 (HTTP ${response.statusCode}). 중앙의 프리뷰 정적 자산을 함께 배포하세요.`, { url })
      return
    }
    if (scriptPath === '/__mew_preview_worker.js' && header(response, 'service-worker-allowed').trim() !== '/') {
      record('assets', false, `${url}: Service-Worker-Allowed: / 헤더가 필요합니다.`, { url })
      return
    }
    if (scriptPath === '/__mew_preview_launch.js' && !response.body.includes('mew-preview-initialized')) {
      record('assets', false, `${url}: initialized handshake가 없는 구버전 launcher입니다. 프리뷰 launcher 수정본을 배포하세요.`, { url })
      return
    }
    record('assets', true, `${scriptPath}: JavaScript 확인`, { url })
  }))
  result.status = result.errors.length ? 'failed' : 'ready'
  return result
}

export function formatPortPreviewReadiness(result) {
  if (result.status === 'skipped') return `[포트 프리뷰] 건너뜀: ${result.checks[0].message}`
  if (result.status === 'ready') return `[포트 프리뷰] 준비 완료: *.${result.previewDomain} DNS·HTTPS·Worker 경로·정적 자산 확인`
  return ['[포트 프리뷰] 준비 실패: Worker 배포 성공만으로 프리뷰를 사용할 수 없습니다.', ...result.errors.map(error => `[${error.stage.toUpperCase()}] ${error.message}`)].join('\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.length && (args.length !== 2 || args[0] !== '--config' || !args[1])) {
    console.error('사용법: node tools/port-preview-readiness.mjs [--config <wrangler.jsonc>]')
    process.exitCode = 1
  } else {
    const result = await checkPortPreviewReadiness({ ...(args.length ? { configPath: path.resolve(args[1]) } : {}) })
    console.log(formatPortPreviewReadiness(result))
    if (result.status === 'failed') process.exitCode = 1
  }
}
