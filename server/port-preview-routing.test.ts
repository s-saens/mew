import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import express from 'express'
import { chromium } from 'playwright-core'
import { createPortPreviewMiddleware, portPreviewFrameUrl } from './port-preview.ts'
import { bindRemoteSocket } from './remote-access-context.ts'
import { resolveAuth } from './reqAuth.ts'
import type { AuthenticatedSession } from './auth.ts'

const owner: AuthenticatedSession = { email: 'routing-preview@example.test', user: { hash: '', role: 'owner', mustChangePassword: false, createdAt: 1, passwordChangedAt: 0 } }
async function start(server: http.Server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`
}
const stop = (server: http.Server) => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) })

const router = `
const render = () => {
  const paths = [location.pathname, window.location.pathname, document.defaultView.location.pathname, self.location.pathname, globalThis.location.pathname];
  document.querySelector('#route').textContent = JSON.stringify({ paths, search: location.search, hash: location.hash, state: history.state?.route ?? null });
};
document.querySelector('#push').onclick = () => { history.pushState({ route: 'push' }, '', '/deep?step=push#first'); render(); };
document.querySelector('#replace').onclick = () => { history.replaceState({ route: 'replace' }, '', '/deep?step=replace#second'); render(); };
document.querySelector('#back').onclick = () => history.back();
document.querySelector('#forward').onclick = () => history.forward();
document.querySelector('#hash').onclick = () => { location.hash = 'third'; };
document.querySelector('#reload').onclick = () => location.reload();
addEventListener('popstate', render);
addEventListener('hashchange', render);
let isolated = false;
try { parent.document.body; } catch { isolated = true; }
document.querySelector('#isolation').textContent = isolated ? 'isolated' : 'unsafe';
render();
`

test('direct preview runs an unconfigured SPA at root and deep routes with native-style history and hash navigation', { timeout: 30_000 }, async t => {
  const requests: string[] = []
  const upstream = http.createServer((req, res) => {
    requests.push(req.url ?? '')
    if (req.url === '/router.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(router); return }
    res.setHeader('Content-Type', 'text/html')
    res.end('<!doctype html><html><head><title>Router fixture</title></head><body><output id="route">Loading</output><output id="isolation"></output><button id="push">Push</button><button id="replace">Replace</button><button id="back">Back</button><button id="forward">Forward</button><button id="hash">Hash</button><button id="reload">Reload</button><a href="/linked?via=anchor#target">Link</a><script type="module" src="/router.js"></script></body></html>')
  })
  const target = await start(upstream); t.after(() => stop(upstream))
  const app = express(), host = http.createServer(app)
  app.use((req, _res, next) => { bindRemoteSocket(req.socket, { current: () => owner, capability: 'port-preview' }); req.auth = resolveAuth(req); next() })
  app.use(createPortPreviewMiddleware())
  const origin = await start(host); t.after(() => stop(host))
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close())
  const page = await browser.newPage(), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const frame = page.frameLocator('iframe')
  const route = async (pathname: string, search = '', hash = '', state: string | null = null) => {
    const text = JSON.stringify({ paths: Array(5).fill(pathname), search, hash, state })
    try {
      await frame.getByText(text, { exact: true }).waitFor({ timeout: 5000 })
    } catch (cause) {
      const actual = await frame.locator('#route').textContent().catch(() => '(missing route)')
      throw new Error(`Expected route ${text}; actual ${actual}; browser errors ${JSON.stringify(errors)}`, { cause })
    }
  }

  await page.goto(`${origin}/${new URL(target).port}`, { waitUntil: 'domcontentloaded' })
  await route('/')
  await frame.getByText('isolated', { exact: true }).waitFor()
  await frame.getByRole('button', { name: 'Push', exact: true }).click()
  await route('/deep', '?step=push', '#first', 'push')
  await frame.getByRole('button', { name: 'Replace', exact: true }).click()
  await route('/deep', '?step=replace', '#second', 'replace')
  await frame.getByRole('button', { name: 'Back', exact: true }).click()
  await route('/')
  await frame.getByRole('button', { name: 'Forward', exact: true }).click()
  await route('/deep', '?step=replace', '#second', 'replace')
  await frame.getByRole('button', { name: 'Hash', exact: true }).click()
  await route('/deep', '?step=replace', '#third')
  await frame.getByRole('button', { name: 'Back', exact: true }).click()
  await route('/deep', '?step=replace', '#second', 'replace')
  await frame.getByRole('button', { name: 'Reload', exact: true }).click()
  await route('/deep', '?step=replace', '#second')
  assert.ok(requests.includes('/deep?step=replace'), 'reload requests the upstream route without a proxy prefix')
  await frame.getByRole('link', { name: 'Link', exact: true }).click()
  await route('/linked', '?via=anchor', '#target')
  assert.ok(requests.includes('/linked?via=anchor'))

  await page.goto(`${origin}/${new URL(target).port}/nested/start?entry=deep#entry`, { waitUntil: 'domcontentloaded' })
  await route('/nested/start', '?entry=deep', '#entry')
  await frame.getByText('isolated', { exact: true }).waitFor()
  assert.deepEqual(errors, [])
})

test('direct preview preserves an API-only upstream root 404 and never substitutes an SPA document', async t => {
  const upstream = http.createServer((_req, res) => { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"message":"Cannot GET /","statusCode":404}') })
  const target = await start(upstream); t.after(() => stop(upstream))
  const app = express(), host = http.createServer(app)
  app.use(createPortPreviewMiddleware())
  const origin = await start(host); t.after(() => stop(host))
  const url = portPreviewFrameUrl(target, owner.email, { active: () => true })
  const response = await fetch(origin + url)
  assert.equal(response.status, 404)
  assert.equal(response.headers.get('content-type'), 'application/json')
  assert.equal(await response.text(), '{"message":"Cannot GET /","statusCode":404}')
})

test('direct preview retains document and window event receivers and nonconfigurable global properties', { timeout: 15_000 }, async t => {
  const source = `
const events = [];
document.addEventListener('preview-probe', () => events.push('document'));
window.addEventListener('preview-probe', () => events.push('window'));
document.dispatchEvent(new window.Event('preview-probe'));
const documentEvents = events.splice(0);
window.dispatchEvent(new window.Event('preview-probe'));
const windowEvents = events.splice(0);
Object.defineProperty(window, 'previewMutableProbe', { value: 1, writable: true, configurable: false });
const initial = Object.getOwnPropertyDescriptor(window, 'previewMutableProbe');
window.previewMutableProbe = 2;
const changed = Object.getOwnPropertyDescriptor(window, 'previewMutableProbe');
Object.defineProperty(window, 'previewConstantProbe', { value: 'constant', writable: false, configurable: false });
const constant = Object.getOwnPropertyDescriptor(window, 'previewConstantProbe');
const observer = new MutationObserver(() => {});
observer.observe(document, { childList: true, subtree: true });
const probe = Document.prototype.createElement.call(document, 'span');
document.body.appendChild(probe);
const nativeDocument = {
  bodyOwner: document.body.ownerDocument === document,
  windowDocument: window.document === document,
  defaultView: document.defaultView === window,
  elementOwner: probe.ownerDocument === document,
  appended: probe.parentNode === document.body,
  observed: observer.takeRecords().some(record => Array.from(record.addedNodes).includes(probe)),
};
observer.disconnect();
probe.remove();
document.querySelector('#result').textContent = JSON.stringify({ documentEvents, windowEvents, initial, changed, constant, mutableValue: window.previewMutableProbe, constantValue: window.previewConstantProbe, nativeDocument });
`
  const upstream = http.createServer((req, res) => {
    if (req.url === '/probe.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(source); return }
    res.setHeader('Content-Type', 'text/html')
    res.end('<!doctype html><html><head></head><body><output id="result">Loading</output><script type="module" src="/probe.js"></script></body></html>')
  })
  const target = await start(upstream); t.after(() => stop(upstream))
  const app = express(), host = http.createServer(app)
  app.use(createPortPreviewMiddleware())
  const origin = await start(host); t.after(() => stop(host))
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close())
  const page = await browser.newPage(), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const url = portPreviewFrameUrl(target, owner.email, { active: () => true })
  await page.goto(origin + url, { waitUntil: 'load' })
  const expected = {
    documentEvents: ['document'], windowEvents: ['window'],
    initial: { value: 1, writable: true, enumerable: false, configurable: false },
    changed: { value: 2, writable: true, enumerable: false, configurable: false },
    constant: { value: 'constant', writable: false, enumerable: false, configurable: false },
    mutableValue: 2, constantValue: 'constant',
    nativeDocument: { bodyOwner: true, windowDocument: true, defaultView: true, elementOwner: true, appended: true, observed: true },
  }
  const actual = await page.locator('#result').textContent()
  assert.deepEqual(errors, [])
  assert.deepEqual(JSON.parse(actual ?? 'null'), expected)
})
