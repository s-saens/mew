import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { checkPortPreviewReadiness, formatPortPreviewReadiness } from './port-preview-readiness.mjs'

const config = { vars: { PREVIEW_DOMAIN: 'preview.mew.run', APP_ORIGIN: 'https://app.mew.run', CENTRAL_ORIGIN: 'https://mew.run' } }
const labels = ['a'.repeat(32), 'b'.repeat(32)]
const launchHtml = '<!doctype html><meta name="mew-preview-parent" content="https://app.mew.run"><script defer src="/__mew_preview_launch.js"></script>'

function fixture(overrides = {}) {
  let index = 0
  const calls = { dns: [], request: [] }
  const options = {
    readFile: async () => JSON.stringify(config),
    randomHost: () => labels[index++],
    lookup: async hostname => { calls.dns.push(hostname); return [{ address: '192.0.2.1', family: 4 }] },
    request: async (url, options) => {
      calls.request.push({ url, options })
      const pathname = new URL(url).pathname
      if (pathname === '/__mew_preview_launch') return { statusCode: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: launchHtml }
      return {
        statusCode: 200,
        headers: { 'content-type': 'text/javascript; charset=utf-8', ...(pathname === '/__mew_preview_worker.js' ? { 'service-worker-allowed': '/' } : {}) },
        body: pathname === '/__mew_preview_launch.js' ? 'parent.postMessage({ type: "mew-preview-initialized" }, owner)' : 'const fixture = true',
      }
    },
    ...overrides,
  }
  return { options, calls }
}

test('two fresh wildcard hosts and all preview assets must be ready before reporting success', async () => {
  const { options, calls } = fixture({ configPath: '/fixture/wrangler.jsonc', readFile: async filename => {
    assert.equal(filename, '/fixture/wrangler.jsonc')
    return `{// JSONC configuration\n "vars": ${JSON.stringify(config.vars)}, }`
  } })
  const result = await checkPortPreviewReadiness(options)
  assert.equal(result.status, 'ready')
  assert.equal(result.previewDomain, 'preview.mew.run')
  assert.equal(result.appOrigin, 'https://app.mew.run')
  assert.deepEqual(result.hosts, labels.map(label => `${label}.preview.mew.run`))
  assert.deepEqual(calls.dns, result.hosts)
  assert.equal(calls.request.length, 5)
  assert.ok(calls.request.every(call => call.url.startsWith('https://') && call.options.timeoutMs === 8000))
  assert.equal(result.checks.filter(check => check.stage === 'assets').length, 3)
  assert.equal(result.errors.length, 0)
  assert.match(formatPortPreviewReadiness(result), /준비 완료/)
})

test('missing wildcard DNS fails even when Worker deployment itself succeeded, with the exact DNS record', async () => {
  const { options, calls } = fixture({ lookup: async () => { throw Object.assign(new Error('hostname not found'), { code: 'ENOTFOUND' }) } })
  const result = await checkPortPreviewReadiness(options)
  assert.equal(result.status, 'failed')
  assert.equal(result.errors.length, 2)
  assert.ok(result.errors.every(error => error.stage === 'dns'))
  assert.match(formatPortPreviewReadiness(result), /CNAME, 이름 \*\.preview, 대상 mew\.run, Proxied/)
  assert.match(formatPortPreviewReadiness(result), /Worker 배포만으로 DNS 레코드는 생성되지 않습니다/)
  assert.equal(calls.request.length, 0)
})

test('a single existing hostname is insufficient to prove wildcard DNS is ready', async () => {
  const { options, calls } = fixture({ lookup: async hostname => {
    if (hostname.startsWith(labels[1])) throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' })
    return [{ address: '192.0.2.1', family: 4 }]
  } })
  const result = await checkPortPreviewReadiness(options)
  assert.equal(result.status, 'failed')
  assert.equal(result.errors.length, 1)
  assert.equal(result.errors[0].hostname, `${labels[1]}.preview.mew.run`)
  assert.equal(calls.request.length, 0)
})

test('certificate failures report the nested wildcard certificate requirement separately from DNS', async () => {
  const { options } = fixture({ request: async () => { throw Object.assign(new Error('Host does not match certificate'), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' }) } })
  const result = await checkPortPreviewReadiness(options)
  assert.equal(result.status, 'failed')
  assert.ok(result.errors.every(error => error.stage === 'tls'))
  assert.match(formatPortPreviewReadiness(result), /\*\.preview\.mew\.run을 포함하는 활성 HTTPS 인증서/)
  assert.match(formatPortPreviewReadiness(result), /\*\.mew\.run 인증서만으로 중첩 하위 도메인/)
})

test('launcher HTTP, MIME, parent origin and script mismatches fail as Worker route errors', async t => {
  const cases = [
    { name: 'redirect', statusCode: 302, headers: { 'content-type': 'text/html', location: 'https://mew.run' }, body: launchHtml },
    { name: 'missing route', statusCode: 503, headers: {}, body: 'Preview connection required' },
    { name: 'wrong MIME', statusCode: 200, headers: { 'content-type': 'application/json' }, body: launchHtml },
    { name: 'app login fallback', statusCode: 200, headers: { 'content-type': 'text/html' }, body: '<html>Sign in to Mew</html>' },
    { name: 'wrong parent', statusCode: 200, headers: { 'content-type': 'text/html' }, body: launchHtml.replace('https://app.mew.run', 'https://other.mew.run') },
    { name: 'missing script', statusCode: 200, headers: { 'content-type': 'text/html' }, body: '<meta name="mew-preview-parent" content="https://app.mew.run">' },
  ]
  for (const value of cases) await t.test(value.name, async () => {
    const { options } = fixture({ request: async () => value })
    const result = await checkPortPreviewReadiness(options)
    assert.equal(result.status, 'failed')
    assert.ok(result.errors.every(error => error.stage === 'route'))
    assert.equal(result.checks.filter(check => check.stage === 'assets').length, 0)
  })
})

test('asset errors identify missing JavaScript, unsafe worker scope and stale launch handshakes', async t => {
  const cases = [
    { name: 'missing runtime', pathname: '/__mew_preview_runtime.js', mutate: response => ({ ...response, statusCode: 404 }) },
    { name: 'HTML MIME', pathname: '/__mew_preview_runtime.js', mutate: response => ({ ...response, headers: { 'content-type': 'text/html' } }) },
    { name: 'HTML fallback labelled as JavaScript', pathname: '/__mew_preview_runtime.js', mutate: response => ({ ...response, body: '<!doctype html><html>fallback</html>' }) },
    { name: 'empty asset', pathname: '/__mew_preview_runtime.js', mutate: response => ({ ...response, body: '' }) },
    { name: 'missing worker scope', pathname: '/__mew_preview_worker.js', mutate: response => ({ ...response, headers: { 'content-type': 'application/javascript' } }) },
    { name: 'wrong worker scope', pathname: '/__mew_preview_worker.js', mutate: response => ({ ...response, headers: { 'content-type': 'application/javascript', 'service-worker-allowed': '/wrong' } }) },
    { name: 'old launcher', pathname: '/__mew_preview_launch.js', mutate: response => ({ ...response, body: 'parent.postMessage({ type: "mew-preview-ready" }, owner)' }) },
  ]
  for (const value of cases) await t.test(value.name, async () => {
    const { options } = fixture()
    const originalRequest = options.request
    options.request = async (url, requestOptions) => {
      const response = await originalRequest(url, requestOptions)
      return new URL(url).pathname === value.pathname ? value.mutate(response) : response
    }
    const result = await checkPortPreviewReadiness(options)
    assert.equal(result.status, 'failed')
    assert.equal(result.errors.length, 1)
    assert.equal(result.errors[0].stage, 'assets')
    assert.ok(result.errors[0].url.endsWith(value.pathname))
  })
})

test('canonical public preview assets satisfy the checker without a server or bundle build', async () => {
  const { options } = fixture()
  const originalRequest = options.request
  options.request = async (url, requestOptions) => {
    const response = await originalRequest(url, requestOptions)
    const filename = new URL(url).pathname.replace('/__mew_preview_', 'port-preview-')
    return filename.endsWith('.js') ? { ...response, body: await fs.readFile(new URL(`../public/${filename}`, import.meta.url), 'utf8') } : response
  }
  assert.equal((await checkPortPreviewReadiness(options)).status, 'ready')
})

test('disabled preview explicitly skips DNS and HTTPS checks', async t => {
  for (const value of [undefined, '', null]) await t.test(String(value), async () => {
    const { options, calls } = fixture({ readFile: async () => JSON.stringify({ vars: { PREVIEW_DOMAIN: value } }) })
    const result = await checkPortPreviewReadiness(options)
    assert.equal(result.status, 'skipped')
    assert.match(formatPortPreviewReadiness(result), /건너뜀.*PREVIEW_DOMAIN이 비활성화/)
    assert.equal(calls.dns.length + calls.request.length, 0)
  })
})

test('malformed configuration and invalid isolation fail before any network access', async t => {
  const cases = [
    { name: 'invalid JSONC', readFile: async () => '{ broken }' },
    { name: 'invalid domain', readFile: async () => JSON.stringify({ vars: { ...config.vars, PREVIEW_DOMAIN: '*.preview.mew.run' } }) },
    { name: 'HTTP app origin', readFile: async () => JSON.stringify({ vars: { ...config.vars, APP_ORIGIN: 'http://app.mew.run' } }) },
    { name: 'app origin includes path', readFile: async () => JSON.stringify({ vars: { ...config.vars, APP_ORIGIN: 'https://app.mew.run/path' } }) },
    { name: 'central origin inside preview domain', readFile: async () => JSON.stringify({ vars: { ...config.vars, PREVIEW_DOMAIN: 'mew.run' } }) },
    { name: 'duplicate generated hosts', randomHost: () => labels[0] },
    { name: 'unbounded timeout', timeoutMs: Infinity },
  ]
  for (const { name, ...overrides } of cases) await t.test(name, async () => {
    const { options, calls } = fixture(overrides)
    const result = await checkPortPreviewReadiness(options)
    assert.equal(result.status, 'failed')
    assert.equal(result.errors[0].stage, 'config')
    assert.equal(calls.dns.length + calls.request.length, 0)
  })
})

test('hung DNS and HTTPS requests have finite deadlines', async t => {
  await t.test('DNS timeout', async () => {
    const { options } = fixture({ timeoutMs: 15, lookup: () => new Promise(() => {}) })
    const result = await checkPortPreviewReadiness(options)
    assert.equal(result.status, 'failed')
    assert.ok(result.errors.every(error => error.stage === 'dns' && error.message.includes('ETIMEDOUT')))
  })
  await t.test('HTTPS timeout', async () => {
    const { options } = fixture({ timeoutMs: 15, request: () => new Promise(() => {}) })
    const result = await checkPortPreviewReadiness(options)
    assert.equal(result.status, 'failed')
    assert.ok(result.errors.every(error => error.stage === 'route' && error.message.includes('ETIMEDOUT')))
  })
})

test('native HTTPS requests explicitly verify certificates and never follow redirects', async t => {
  const requests = []
  t.mock.method(https, 'get', (url, options, callback) => {
    requests.push({ url, options })
    const request = new EventEmitter()
    request.destroy = error => { request.emit('error', error); request.emit('close') }
    queueMicrotask(() => {
      const response = new EventEmitter()
      response.statusCode = 302
      response.headers = { location: 'https://redirect.invalid/', 'content-type': 'text/html' }
      callback(response)
      response.emit('data', Buffer.from('redirect'))
      response.emit('end')
      request.emit('close')
    })
    return request
  })
  const { options } = fixture()
  delete options.request
  const result = await checkPortPreviewReadiness(options)
  assert.equal(result.status, 'failed')
  assert.equal(requests.length, 2)
  assert.ok(requests.every(request => request.options.rejectUnauthorized === true && !request.url.includes('redirect.invalid')))
  assert.ok(result.errors.every(error => error.stage === 'route' && error.message.includes('HTTP 302')))
})

test('CLI supports an explicit JSONC path, reports skip, and exits nonzero on invalid configuration', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-preview-readiness-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const configPath = path.join(directory, 'wrangler.jsonc')
  const script = new URL('./port-preview-readiness.mjs', import.meta.url)
  await fs.writeFile(configPath, '{ /* intentionally disabled */ "vars": {}, }')
  const skipped = spawnSync(process.execPath, [script.pathname, '--config', configPath], { encoding: 'utf8', timeout: 5000 })
  assert.equal(skipped.status, 0, skipped.stderr)
  assert.match(skipped.stdout, /건너뜀/)
  await fs.writeFile(configPath, '{ broken }')
  const failed = spawnSync(process.execPath, [script.pathname, '--config', configPath], { encoding: 'utf8', timeout: 5000 })
  assert.equal(failed.status, 1, failed.stderr)
  assert.match(failed.stdout, /\[CONFIG\]/)
  const invalid = spawnSync(process.execPath, [script.pathname, '--unknown'], { encoding: 'utf8', timeout: 5000 })
  assert.equal(invalid.status, 1)
  assert.match(invalid.stderr, /사용법/)
})
