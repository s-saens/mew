import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { compile } from '@tailwindcss/node'
import { build } from 'rolldown'
import { chromium, type Page } from 'playwright-core'
import { domBrowserExecutable } from '../../server/browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '../..')
const drawingPath = path.join(root, 'src/components/drawing/DrawingEditor.tsx')
const origin = 'http://mew-error-boundary.test'

async function fixtureBundle() {
  const source = `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {AppErrorBoundary} from ${JSON.stringify(path.join(root, 'src/components/app-error-boundary.tsx'))};
    import {DeferredDrawingEditor} from ${JSON.stringify(path.join(root, 'src/components/drawing/deferred-drawing-editor.tsx'))};
    import {I18nProvider} from ${JSON.stringify(path.join(root, 'src/i18n.tsx'))};
    const LazyBrokenChild=React.lazy(()=>import('virtual:root-tool.tsx'));
    function BrokenChild(){throw new Error('fixture root render failure')}
    function Fixture(){
      const [open,setOpen]=React.useState(false),[broken,setBroken]=React.useState(false);
      return <AppErrorBoundary><textarea aria-label="Existing draft" defaultValue="Original draft"/>
        <button onClick={()=>setOpen(true)}>Open drawing</button><button onClick={()=>setBroken(true)}>Break workspace</button>
        {broken&&(new URLSearchParams(location.search).has('root-lazy')?<React.Suspense fallback={<div role="status"/>}><LazyBrokenChild/></React.Suspense>:<BrokenChild/>)}
        {open&&<DeferredDrawingEditor context="document" projectRoot="/workspace" onClose={()=>setOpen(false)} onSave={async()=>{}}/>}
      </AppErrorBoundary>
    }
    createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);
  `
  const drawingStub = `
    import React from 'react';
    import {DialogFrame} from '@mew/ui';
    import {uiText} from '@mew/ui/i18n-core';
    export function DrawingEditor({onClose,context,projectRoot}){
      if(new URLSearchParams(location.search).has('throw'))throw new Error('fixture drawing render failure');
      return <DialogFrame labelledBy="healthy-drawing-title" onClose={onClose}>
        <h2 id="healthy-drawing-title">{uiText('그림판')}</h2><div data-drawing-ready>{context}:{projectRoot}</div>
        <button onClick={onClose}>{uiText('닫기')}</button>
      </DialogFrame>;
    }
  `
  const candidates = [source, drawingStub]
  const bundle = await build({
    input: 'virtual:error-boundary.tsx', write: false, platform: 'browser', output: { format: 'esm' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production') } },
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    plugins: [{
      name: 'error-boundary-fixture',
      resolveId(id) { if (id.startsWith('virtual:')) return id },
      load(id) {
        if (id === 'virtual:error-boundary.tsx') return source
        if (id === 'virtual:root-tool.tsx') return 'export default function RootTool(){return null}'
        if (id === drawingPath) return drawingStub
        if (id.endsWith('.tsx')) candidates.push(fs.readFileSync(id, 'utf8'))
        if (id.endsWith('.css')) return { code: '', moduleType: 'js' }
      },
    }],
  })
  const chunks = bundle.output.filter(item => item.type === 'chunk')
  const entry = chunks.find(item => item.isEntry)!
  const drawing = chunks.find(item => drawingPath in item.modules)
  const rootTool = chunks.find(item => 'virtual:root-tool.tsx' in item.modules)!
  assert.ok(drawing, 'the real deferred wrapper creates a DrawingEditor dynamic import')
  assert.notEqual(drawing.fileName, entry.fileName, 'drawing code stays outside the entry bundle')
  const compiler = await compile(fs.readFileSync(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set(candidates.join('\n').match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  return {
    scripts: new Map(chunks.map(item => [`/${item.fileName}`, item.code])),
    drawingScript: `/${drawing.fileName}`,
    rootToolScript: `/${rootTool.fileName}`,
    html: `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script type="module" src="/${entry.fileName}"></script></html>`,
  }
}

type FixtureBundle = Awaited<ReturnType<typeof fixtureBundle>>
type DrawingResponse = 'healthy' | 'missing' | 'invalid'

async function serveFixture(page: Page, bundle: FixtureBundle, locale: 'ko' | 'en', response: DrawingResponse = 'healthy') {
  const errors: string[] = [], requested: string[] = []
  let releaseDrawing!: () => void
  const drawingGate = new Promise<void>(resolve => { releaseDrawing = resolve })
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(locale => {
    localStorage.setItem('mew:locale', locale)
    localStorage.setItem('mew:ui-locale', locale)
  }, locale)
  await page.route(`${origin}/**`, async route => {
    const pathname = new URL(route.request().url()).pathname
    requested.push(pathname)
    if (pathname === bundle.rootToolScript) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Old workspace chunk unavailable' })
    if (pathname === bundle.drawingScript) {
      await drawingGate
      if (response === 'missing') return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Old build chunk unavailable' })
      if (response === 'invalid') return route.fulfill({ contentType: 'text/javascript', body: 'export {' })
    }
    const script = bundle.scripts.get(pathname)
    return route.fulfill(script === undefined ? { contentType: 'text/html', body: bundle.html } : { contentType: 'text/javascript', body: script })
  })
  return { errors, requested, releaseDrawing }
}

test('drawing import and render failures stay inside a closable dialog and preserve the workspace draft', { skip: !domBrowserExecutable(), timeout: 60_000 }, async t => {
  const bundle = await fixtureBundle()
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  for (const width of [1100, 390]) for (const locale of ['ko', 'en'] as const) for (const failure of ['missing', 'invalid', 'render'] as const) {
    await t.test(`${width}px ${locale} ${failure}`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width < 768, locale: locale === 'ko' ? 'ko-KR' : 'en-US' })
      page.setDefaultTimeout(5000)
      const fixture = await serveFixture(page, bundle, locale, failure === 'render' ? 'healthy' : failure)
      try {
        await page.goto(`${origin}/${failure === 'render' ? '?throw=1' : ''}`)
        const draft = page.getByRole('textbox', { name: 'Existing draft', exact: true })
        await draft.fill('Unsaved draft must survive')
        assert.equal(fixture.requested.includes(bundle.drawingScript), false, 'a closed drawing does not download its implementation')
        const requested = page.waitForRequest(request => new URL(request.url()).pathname === bundle.drawingScript)
        await page.getByRole('button', { name: 'Open drawing', exact: true }).click()
        await requested
        await page.getByRole('status').waitFor()
        assert.equal(await draft.inputValue(), 'Unsaved draft must survive')
        fixture.releaseDrawing()
        const dialog = page.getByRole('dialog', { name: locale === 'ko' ? '그림판' : 'Drawing editor', exact: true })
        await dialog.waitFor()
        const alert = dialog.getByRole('alert')
        await alert.waitFor()
        assert.match(await alert.innerText(), locale === 'ko' ? /그림판을 불러오지 못했습니다\./ : /could not|couldn.t|unable|failed/i)
        assert.match(await dialog.innerText(), locale === 'ko' ? /버전|빌드|서버/ : /version|build|server/i)
        assert.equal(await alert.getByRole('button', { name: locale === 'ko' ? '새로고침' : 'Refresh', exact: true }).isVisible(), true)
        assert.equal(await draft.inputValue(), 'Unsaved draft must survive', 'only the drawing subtree is replaced')
        const box = await dialog.boundingBox()
        assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1, 'the recovery dialog fits the viewport')
        if (process.env.MEW_ERROR_BOUNDARY_SCREENSHOTS && locale === 'ko' && failure === 'missing') {
          await page.screenshot({ path: `/tmp/mew-drawing-error-${width}.png` })
        }
        await dialog.getByRole('button', { name: locale === 'ko' ? '닫기' : 'Close', exact: true }).click()
        await dialog.waitFor({ state: 'detached' })
        await draft.fill('Still editable after closing')
        assert.equal(await draft.inputValue(), 'Still editable after closing')
        if (width === 1100 && locale === 'ko' && failure === 'missing') {
          await page.getByRole('button', { name: 'Open drawing', exact: true }).click()
          const reloaded = page.waitForRequest(request => request.isNavigationRequest() && request.url() === `${origin}/`)
          await page.getByRole('alert').getByRole('button', { name: '새로고침', exact: true }).click()
          await reloaded
          await page.getByRole('button', { name: 'Open drawing', exact: true }).waitFor()
        }
        assert.deepEqual(fixture.errors, [], 'caught import/render errors do not become unhandled browser errors')
      } finally { fixture.releaseDrawing(); await page.close() }
    })
  }
})

test('closing a loading drawing preserves the draft and a late healthy import only opens when requested again', { skip: !domBrowserExecutable(), timeout: 20_000 }, async t => {
  const bundle = await fixtureBundle()
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
  page.setDefaultTimeout(5000)
  const fixture = await serveFixture(page, bundle, 'ko')
  try {
    await page.goto(origin)
    await page.getByRole('button', { name: 'Open drawing', exact: true }).waitFor()
    const draft = page.getByRole('textbox', { name: 'Existing draft', exact: true })
    await draft.fill('Draft while downloading')
    assert.equal(fixture.requested.includes(bundle.drawingScript), false)
    const requested = page.waitForRequest(request => new URL(request.url()).pathname === bundle.drawingScript)
    await page.getByRole('button', { name: 'Open drawing', exact: true }).click()
    await requested
    await page.getByRole('status').waitFor()
    const dialog = page.getByRole('dialog', { name: '그림판', exact: true })
    await dialog.getByRole('button', { name: '닫기', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })
    const downloaded = page.waitForResponse(response => new URL(response.url()).pathname === bundle.drawingScript)
    fixture.releaseDrawing()
    await (await downloaded).finished()
    await draft.evaluate(el => new Promise<void>(resolve => el.ownerDocument.defaultView!.requestAnimationFrame(() => el.ownerDocument.defaultView!.requestAnimationFrame(() => resolve()))))
    assert.equal(await page.getByRole('dialog').count(), 0, 'a late import cannot reopen a dismissed dialog')
    assert.equal(await draft.inputValue(), 'Draft while downloading')
    await page.getByRole('button', { name: 'Open drawing', exact: true }).click()
    await dialog.locator('[data-drawing-ready]').waitFor()
    assert.equal(await dialog.locator('[data-drawing-ready]').innerText(), 'document:/workspace')
    assert.equal(await page.getByRole('alert').count(), 0)
    await dialog.getByRole('button', { name: '닫기', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })
    assert.deepEqual(fixture.errors, [])
  } finally { fixture.releaseDrawing(); await page.close() }
})

test('uncaught workspace render and lazy import errors show an accessible root recovery screen', { skip: !domBrowserExecutable(), timeout: 20_000 }, async t => {
  const bundle = await fixtureBundle()
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  for (const locale of ['ko', 'en'] as const) for (const failure of ['render', 'lazy'] as const) {
    const page = await browser.newPage({ viewport: { width: locale === 'ko' ? 1100 : 390, height: 844 } })
    page.setDefaultTimeout(5000)
    const fixture = await serveFixture(page, bundle, locale)
    try {
      const href = `${origin}/${failure === 'lazy' ? '?root-lazy=1' : ''}`
      await page.goto(href)
      assert.equal(fixture.requested.includes(bundle.rootToolScript), false)
      await page.getByRole('button', { name: 'Break workspace', exact: true }).click()
      const alert = page.getByRole('alert')
      await alert.waitFor()
      assert.match(await alert.innerText(), locale === 'ko' ? /작업 화면을 불러오지 못했습니다/ : /workspace|work screen/i)
      assert.match(await alert.innerText(), locale === 'ko' ? /버전|빌드|서버/ : /version|build|server/i)
      const refresh = alert.getByRole('button', { name: locale === 'ko' ? '새로고침' : 'Refresh', exact: true })
      await refresh.waitFor()
      const reloaded = page.waitForRequest(request => request.isNavigationRequest() && request.url() === href)
      await refresh.click()
      await reloaded
      await page.getByRole('button', { name: 'Break workspace', exact: true }).waitFor()
      assert.deepEqual(fixture.errors, [])
    } finally { fixture.releaseDrawing(); await page.close() }
  }
})
