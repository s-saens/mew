import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

async function fixtureCode() {
  const source = `
import React from ${JSON.stringify(import.meta.resolve('react'))};
import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
import {I18nProvider} from ${JSON.stringify(new URL('../src/i18n.tsx', import.meta.url).pathname)};
import {useTabs} from ${JSON.stringify(new URL('../src/hooks/useTabs.ts', import.meta.url).pathname)};
const noop=()=>{};
const split=new URLSearchParams(location.search).has('split');
if(split){const timeout=window.setTimeout.bind(window);window.setTimeout=(handler,delay,...args)=>timeout(handler,delay===500?60000:delay,...args)}
const plain=path=>({path,preview:false,viewMode:'plain'});
const accountTabs=split?{docs:{panes:[{id:'first',tabs:[plain('shared.txt'),plain('other.txt')],activePath:'other.txt'},{id:'second',tabs:[plain('shared.txt')],activePath:'shared.txt'}],layout:{kind:'split',dir:'row',kids:[{kind:'leaf',id:'first'},{kind:'leaf',id:'second'}]},focusedPaneId:'second'}}:undefined;
function Fixture(){
  const tabs=useTabs('docs',noop,message=>{window.notice=message},'/fixture',accountTabs);
  window.tabs=tabs;
  return <pre id="state">{JSON.stringify(tabs.activeTab)}</pre>;
}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({
    input: 'virtual:file-cache-race.tsx', write: false, platform: 'browser', output: { format: 'esm', codeSplitting: false },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production') } },
    plugins: [{ name: 'file-cache-race', resolveId(id) {
      if (id === 'virtual:file-cache-race.tsx') return id
      if (id.endsWith('/contentCache') || id.endsWith('/contentCache.ts')) return 'virtual:cache'
      if (id.endsWith('.css')) return 'virtual:style'
    }, load(id) {
      if (id === 'virtual:file-cache-race.tsx') return source
      if (id === 'virtual:style') return ''
      if (id === 'virtual:cache') return `
window.cacheReaders={};window.cacheWrites=[];
export const getCachedFile=()=>undefined;
export const loadCachedFile=(project,path)=>new Promise(resolve=>{window.cacheReaders[path]=resolve});
export const putCachedFile=(project,path,file)=>window.cacheWrites.push({path,...file});
export const dropCachedFile=()=>{};`
    } }],
  })
  return bundle.output.find(item => item.type === 'chunk')!.code
}

test('persistent file caches cannot delay validation or replace a later response or denial', { skip: !domBrowserExecutable(), timeout: 30_000 }, async () => {
  const code = await fixtureCode()
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(5000)
    const reads: string[] = [], writes: string[] = []
    const release = new Map<string, () => void>()
    await page.route('http://mew-cache-race.test/**', async route => {
      const request = route.request(), url = new URL(request.url())
      if (url.pathname === '/api/file') {
        const path = url.searchParams.get('path')!
        if (request.method() !== 'GET') { writes.push(path); return route.fulfill({ json: {} }) }
        reads.push(path)
        assert.equal(url.searchParams.has('version'), false, 'an unresolved disk cache cannot supply a conditional version')
        await new Promise<void>(resolve => release.set(path, resolve))
        if (path === 'denied.md') return route.fulfill({ status: 403, json: { error: 'Permission denied' } })
        return route.fulfill({ json: { path, content: `Current ${path}`, editable: true, version: { size: 20, mtimeMs: 2, tag: 'current' } } })
      }
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: [] })
      return route.fulfill(url.pathname === '/app.js'
        ? { contentType: 'text/javascript', body: code }
        : { contentType: 'text/html', body: '<!doctype html><div id="root"></div><script type="module" src="/app.js"></script>' })
    })
    await page.goto('http://mew-cache-race.test/')
    await page.waitForFunction('window.tabs !== undefined')
    const open = async (path: string) => {
      await page.evaluate(path => (globalThis as unknown as { tabs: { openFile(path: string): void } }).tabs.openFile(path), path)
      await page.waitForFunction(path => !!(globalThis as unknown as { cacheReaders: Record<string, unknown> }).cacheReaders[path], path)
      assert.ok(reads.includes(path), 'the real file read starts while the disk cache remains unresolved')
    }
    const cached = async (path: string) => page.locator('body').evaluate((element, path) => {
      const state = globalThis as unknown as { cacheReaders: Record<string, (snapshot: unknown) => void> }
      state.cacheReaders[path]({ content: `Old ${path}`, editable: true, version: { size: 10, mtimeMs: 1, tag: 'old' } })
      const view = element.ownerDocument.defaultView!
      return new Promise(resolve => view.requestAnimationFrame(() => view.requestAnimationFrame(resolve)))
    }, path)
    await open('late.md')
    release.get('late.md')!()
    await page.waitForFunction('window.tabs.activeTab.content === "Current late.md" && window.tabs.activeTab.editable')
    await cached('late.md')
    assert.equal(await page.evaluate('window.tabs.activeTab.content'), 'Current late.md', 'late cache text cannot overwrite a validated body')

    await open('preview.md')
    await cached('preview.md')
    await page.waitForFunction('window.tabs.activeTab.content === "Old preview.md"')
    assert.equal(await page.evaluate('window.tabs.activeTab.editable'), false)
    assert.equal(await page.evaluate('window.tabs.activeTab.revalidating'), true)
    release.get('preview.md')!()
    await page.waitForFunction('window.tabs.activeTab.content === "Current preview.md" && window.tabs.activeTab.editable')

    await open('denied.md')
    release.get('denied.md')!()
    await page.waitForFunction('window.notice === "Permission denied"')
    await cached('denied.md')
    assert.equal(await page.evaluate('window.tabs.activeTab.content'), '', 'late disk data cannot restore a denied file')
    assert.equal(await page.evaluate('window.tabs.activeTab.editable'), false)
    assert.deepEqual(writes, [], 'cache previews and validation never autosave')
    await page.close()
  } finally { await browser.close() }
})


test('a disk snapshot skipped for a dirty verified peer preserves the original conflict baseline', { skip: !domBrowserExecutable(), timeout: 20_000 }, async () => {
  const code = await fixtureCode()
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(5000)
    let sharedReads = 0, releaseRead!: () => void, peerReadStarted!: () => void
    const peerRequested = new Promise<void>(resolve => { peerReadStarted = resolve })
    const writes: string[] = []
    const pending = new Promise<void>(resolve => { releaseRead = resolve })
    await page.route('http://mew-dirty-cache.test/**', async route => {
      const request = route.request(), url = new URL(request.url())
      if (url.pathname === '/api/file') {
        const path = url.searchParams.get('path')!
        if (request.method() !== 'GET') { writes.push(path); return route.fulfill({ json: {} }) }
        if (path === 'shared.txt' && ++sharedReads > 1) { peerReadStarted(); await pending }
        return route.fulfill({ json: { path, content: path === 'shared.txt' && sharedReads > 1 ? 'Different server body' : 'Original baseline', editable: true } })
      }
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: [] })
      return route.fulfill(url.pathname === '/app.js'
        ? { contentType: 'text/javascript', body: code }
        : { contentType: 'text/html', body: '<div id="root"></div><script type="module" src="/app.js"></script>' })
    })
    await page.goto('http://mew-dirty-cache.test/?split=1')
    await page.waitForFunction('window.tabs?.panes[1].tabs[0].editable && !window.tabs.panes[1].tabs[0].revalidating')
    await page.evaluate("window.tabs.openFile('shared.txt', {paneId:'first'})")
    await page.waitForFunction('window.tabs.panes[0].tabs[0].revalidating === true')
    await peerRequested
    assert.equal(sharedReads, 2, 'the deferred peer starts its read before waiting for disk')
    await page.evaluate("window.tabs.updateTabContent('shared.txt', 'Verified draft', 'second')")
    await page.waitForFunction("window.tabs.panes[1].tabs[0].content === 'Verified draft'")
    await page.locator('body').evaluate(element => {
      const state = globalThis as unknown as { cacheReaders: Record<string, (snapshot: unknown) => void> }
      state.cacheReaders['shared.txt']({ content: 'Old disk snapshot', editable: true })
      return new Promise(resolve => element.ownerDocument.defaultView!.requestAnimationFrame(resolve))
    })
    assert.equal(await page.evaluate('window.tabs.panes[0].tabs[0].content'), 'Verified draft', 'a skipped disk preview never overwrites the draft')
    releaseRead()
    await page.waitForFunction('window.tabs.panes[0].tabs[0].revalidating === false')
    assert.deepEqual(await page.evaluate("window.tabs.panes.map(pane=>{const tab=pane.tabs.find(tab=>tab.path==='shared.txt');return {content:tab.content,savedContent:tab.savedContent,status:tab.status}})"), [
      { content: 'Verified draft', savedContent: 'Original baseline', status: 'error' },
      { content: 'Verified draft', savedContent: 'Original baseline', status: 'error' },
    ], 'the changed server body conflicts with the original baseline even though disk preview was skipped')
    assert.deepEqual(writes, [], 'a conflict cannot autosave a stale body')
    await page.close()
  } finally { await browser.close() }
})

test('a bounded disk lookup hands an anchor preview over to the full editable body', { skip: !domBrowserExecutable(), timeout: 20_000 }, async () => {
  const code = await fixtureCode()
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(5000)
    const reads: string[] = [], writes: string[] = []
    let releaseFull!: () => void, fullReadStarted!: () => void
    const fullRequested = new Promise<void>(resolve => { fullReadStarted = resolve })
    const pendingFull = new Promise<void>(resolve => { releaseFull = resolve })
    await page.route('http://mew-anchor-cache.test/**', async route => {
      const request = route.request(), url = new URL(request.url())
      if (url.pathname === '/api/file') {
        if (request.method() !== 'GET') { writes.push(request.method()); return route.fulfill({ json: {} }) }
        reads.push(url.search)
        if (url.searchParams.has('anchorLine')) return route.fulfill({ json: { path: 'large.txt', content: 'Partial target line', editable: true, partial: true, anchorLine: 900, lineStart: 700, lineEnd: 1100, totalLines: null, version: { size: 800000, mtimeMs: 1, tag: 'partial' } } })
        fullReadStarted()
        await pendingFull
        return route.fulfill({ json: { path: 'large.txt', content: 'Complete file body', editable: true, version: { size: 800000, mtimeMs: 1, tag: 'full' } } })
      }
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: [] })
      return route.fulfill(url.pathname === '/app.js'
        ? { contentType: 'text/javascript', body: code }
        : { contentType: 'text/html', body: '<div id="root"></div><script type="module" src="/app.js"></script>' })
    })
    await page.goto('http://mew-anchor-cache.test/')
    await page.waitForFunction('window.tabs?.hydrated')
    await page.evaluate("window.tabs.openFile('large.txt', {viewMode:'plain',anchorLine:900})")
    await page.waitForFunction('!!window.cacheReaders["large.txt"]')
    await page.waitForFunction('window.tabs.activeTab?.anchorPreview?.anchorLine === 900')
    await fullRequested
    assert.equal(reads.length, 2, 'the unresolved disk lookup reaches its 40ms deadline, then preview and full requests start')
    assert.equal(new URLSearchParams(reads[0]).get('anchorLine'), '900')
    assert.equal(new URLSearchParams(reads[1]).has('anchorLine'), false)
    assert.equal(await page.evaluate('window.tabs.activeTab.content'), 'Partial target line')
    assert.equal(await page.evaluate('window.tabs.activeTab.revalidating'), true, 'the partial body remains protected until full validation')
    assert.deepEqual(await page.evaluate('window.cacheWrites'), [], 'a partial body is never persisted')
    releaseFull()
    await page.waitForFunction('window.tabs.activeTab.revalidating === false')
    assert.deepEqual(await page.evaluate('({content:window.tabs.activeTab.content,savedContent:window.tabs.activeTab.savedContent,editable:window.tabs.activeTab.editable,anchor:window.tabs.activeTab.anchorPreview??null})'), {
      content: 'Complete file body', savedContent: 'Complete file body', editable: true, anchor: null,
    })
    assert.deepEqual(await page.evaluate('window.cacheWrites.map(entry=>entry.content)'), ['Complete file body'])
    assert.deepEqual(writes, [])
    await page.close()
  } finally { await browser.close() }
})
