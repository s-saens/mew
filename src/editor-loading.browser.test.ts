import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { build } from 'rolldown'
import { chromium, type Page } from 'playwright-core'
import { domBrowserExecutable } from '../server/browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')
const component = path.join(root, 'src/components/deferred-editor-pane.tsx')
const deferred = path.join(root, 'src/components/deferred-component.tsx')
const initial = { authEmail: 'first@example.test', role: 'owner', workspace: { path: '/first' }, isGuest: false, canCollaborate: true, accessVersion: 'first' }

test('editor module completion uses the current scope without a lazy retry', { skip: !domBrowserExecutable(), timeout: 45_000 }, async t => {
  const source = `import React, {useEffect, useState} from 'react';
    import {createRoot} from 'react-dom/client'; import {flushSync} from 'react-dom';
    import {DeferredEditorPane} from ${JSON.stringify(component)};
    import {deferredComponent} from ${JSON.stringify(deferred)};
    const loads=[]; window.fixtureMounts=[];
    function EditorPane(props){const label=JSON.stringify([props.authEmail,props.role,props.workspace.path,props.isGuest,props.canCollaborate]);useEffect(()=>{window.fixtureMounts.push(label)},[label]);return <button data-editor>{label}</button>}
    // Only the module loader is controlled; both component implementations and React are real.
    window.fixtureLoadEditor=()=>new Promise((resolve,reject)=>{loads.push({resolve,reject})});
    window.fixtureLoadCount=()=>loads.length;
    window.fixtureResolve=index=>loads[index].resolve({EditorPane});
    window.fixtureReject=index=>loads[index].reject(new Error('Controlled module failure'));
    const Baseline=deferredComponent(()=>window.fixtureLoadEditor().then(module=>({default:module.EditorPane})));
    function Fixture(){const [props,setProps]=useState(${JSON.stringify(initial)}),[mounted,setMounted]=useState(true);
      useEffect(()=>{window.fixtureUpdate=value=>{flushSync(()=>setProps(current=>({...current,...value})));return {editor:!!document.querySelector('[data-editor]'),loading:!!document.querySelector('[role=status]')}};window.fixtureUnmount=()=>flushSync(()=>setMounted(false))},[]);
      const Component=location.search.includes('baseline')?Baseline:DeferredEditorPane;
      return mounted?<Component {...props}/>:<div data-unmounted/>;
    }
    createRoot(document.getElementById('root')).render(<Fixture/>);`
  const result = await build({ input: 'virtual:editor-loading.tsx', write: false, platform: 'browser', transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': '"production"', 'import.meta.hot': 'false' } }, output: { format: 'esm', minify: true }, plugins: [{
    name: 'controlled-editor-module',
    resolveId(id) { if (id.endsWith('.css')) return 'virtual:style'; if (id === 'virtual:editor-loading.tsx') return id },
    async load(id) {
      if (id === 'virtual:style') return ''
      if (id === 'virtual:editor-loading.tsx') return source
      if (id === component) {
        const code = await fs.readFile(id, 'utf8')
        assert.equal(code.split("void import('./EditorPane')").length, 2)
        return code.replace("void import('./EditorPane')", 'void window.fixtureLoadEditor()')
      }
    },
  }] })
  const chunks = result.output.filter(item => item.type === 'chunk'), entry = chunks.find(item => item.isEntry)!
  const scripts = new Map(chunks.map(item => ['/' + item.fileName, item.code]))
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())

  async function fixture(query = '') {
    const page = await browser.newPage()
    page.setDefaultTimeout(5000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      const nativeSet = window.setTimeout, nativeClear = window.clearTimeout
      let next = 1_000_000
      const held = new Map<number, { callback: TimerHandler; args: unknown[] }>()
      Object.assign(window, {
        fixtureHeldDelays: [] as number[],
        fixtureReleaseTimers() {
          for (const [id, value] of held) {
            held.delete(id)
            if (typeof value.callback === 'function') Reflect.apply(value.callback, window, value.args)
          }
        },
      })
      window.setTimeout = function (callback: TimerHandler, delay = 0, ...args: unknown[]) {
        if (typeof callback === 'function' && callback.name.startsWith('bound ') && delay > 10 && delay <= 300) {
          const id = next++; held.set(id, { callback, args })
          ;(window as unknown as { fixtureHeldDelays: number[] }).fixtureHeldDelays.push(delay)
          return id
        }
        return nativeSet(callback, delay, ...args)
      }
      window.clearTimeout = id => { if (!held.delete(Number(id))) nativeClear(id) }
    })
    await page.route('http://mew-editor.test/**', route => {
      const url = new URL(route.request().url())
      return scripts.has(url.pathname)
        ? route.fulfill({ contentType: 'text/javascript', body: scripts.get(url.pathname)! })
        : route.fulfill({ contentType: 'text/html', body: `<!doctype html><div id="root"></div><script type="module" src="/${entry.fileName}"></script>` })
    })
    await page.goto('http://mew-editor.test/' + query, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => (window as unknown as { fixtureLoadCount(): number }).fixtureLoadCount?.() === 1)
    assert.equal(await page.locator('[role=status] .mew-loading-dot').count(), 3, 'editor preparation uses three dots')
    assert.equal(await page.locator('.mew-loading-logo').count(), 0, 'editor preparation never displays the full-screen logo')
    return { page, errors }
  }
  const settle = (page: Page, index: number, reject = false) => page.evaluate(({ index, reject }) => {
    const fixture = window as unknown as { fixtureResolve(index: number): void; fixtureReject(index: number): void }
    if (reject) fixture.fixtureReject(index)
    else fixture.fixtureResolve(index)
  }, { index, reject })
  const update = (page: Page, value: object) => page.evaluate(value => (window as unknown as { fixtureUpdate(value: object): { editor: boolean; loading: boolean } }).fixtureUpdate(value), value)
  const loaded = (page: Page, count: number) => page.waitForFunction(count => (window as unknown as { fixtureLoadCount(): number }).fixtureLoadCount() === count, count)

  await t.test('real deferredComponent waits for a held React retry; awaited editor mounts before release', async () => {
    const baseline = await fixture('?baseline')
    try {
      await settle(baseline.page, 0)
      await baseline.page.waitForFunction(() => (window as unknown as { fixtureHeldDelays: number[] }).fixtureHeldDelays.length > 0)
      assert.equal(await baseline.page.locator('[data-editor]').count(), 0)
      await baseline.page.evaluate(() => (window as unknown as { fixtureReleaseTimers(): void }).fixtureReleaseTimers())
      await baseline.page.locator('[data-editor]').waitFor()
      assert.deepEqual(baseline.errors, [])
    } finally { await baseline.page.close() }
    const actual = await fixture()
    try {
      await settle(actual.page, 0)
      await actual.page.locator('[data-editor]').waitFor()
      assert.deepEqual(await actual.page.evaluate(() => (window as unknown as { fixtureHeldDelays: number[] }).fixtureHeldDelays), [])
      assert.deepEqual(actual.errors, [])
    } finally { await actual.page.close() }
  })

  await t.test('account, role, root and access version changes hide pending and ready outcomes immediately', async () => {
    const changes = [
      [{ authEmail: 'second@example.test' }, { authEmail: 'third@example.test' }],
      [{ role: 'member' }, { role: 'guest' }],
      [{ workspace: { path: '/second' } }, { workspace: { path: '/third' } }],
      [{ accessVersion: 'second' }, { accessVersion: 'third' }],
    ]
    for (const [pending, ready] of changes) {
      const actual = await fixture()
      try {
        assert.deepEqual(await update(actual.page, pending), { editor: false, loading: true })
        await loaded(actual.page, 2)
        await settle(actual.page, 0)
        assert.equal(await actual.page.locator('[data-editor]').count(), 0)
        await settle(actual.page, 1)
        await actual.page.locator('[data-editor]').waitFor()
        assert.deepEqual(await update(actual.page, ready), { editor: false, loading: true })
        await loaded(actual.page, 3)
        await settle(actual.page, 2)
        await actual.page.locator('[data-editor]').waitFor()
        const mounts = await actual.page.evaluate(() => (window as unknown as { fixtureMounts: string[] }).fixtureMounts)
        assert.equal(mounts.length, 2, 'the first scope must never mount')
        assert.deepEqual(actual.errors, [])
      } finally { await actual.page.close() }
    }
  })

  await t.test('stale fulfillment or rejection cannot replace the current successful scope', async () => {
    for (const reject of [false, true]) {
      const actual = await fixture()
      try {
        await update(actual.page, { authEmail: 'second@example.test', accessVersion: 'second' })
        await loaded(actual.page, 2)
        await settle(actual.page, 1)
        await actual.page.locator('[data-editor]').waitFor()
        await settle(actual.page, 0, reject)
        assert.equal(await actual.page.locator('[role=alert]').count(), 0)
        assert.match(await actual.page.locator('[data-editor]').innerText(), /second@example.test/)
        assert.equal((await actual.page.evaluate(() => (window as unknown as { fixtureMounts: string[] }).fixtureMounts)).length, 1)
        assert.deepEqual(actual.errors, [])
      } finally { await actual.page.close() }
    }
  })

  await t.test('unmount ignores either late module outcome without an unhandled rejection', async () => {
    for (const reject of [false, true]) {
      const actual = await fixture()
      try {
        await actual.page.evaluate(() => (window as unknown as { fixtureUnmount(): void }).fixtureUnmount())
        await actual.page.locator('[data-unmounted]').waitFor({ state: 'attached' })
        await settle(actual.page, 0, reject)
        assert.equal(await actual.page.locator('[data-editor], [role=alert]').count(), 0)
        assert.deepEqual(await actual.page.evaluate(() => (window as unknown as { fixtureMounts: string[] }).fixtureMounts), [])
        assert.deepEqual(actual.errors, [])
      } finally { await actual.page.close() }
    }
  })

  await t.test('current import failure shows the existing localized recovery message', async () => {
    const actual = await fixture()
    try {
      await settle(actual.page, 0, true)
      await actual.page.getByRole('alert').waitFor()
      assert.equal(await actual.page.getByRole('alert').innerText(), '작업 화면을 불러오지 못했습니다. 페이지를 다시 열어 주세요.')
      assert.equal(await actual.page.locator('[data-editor]').count(), 0)
      assert.deepEqual(actual.errors, [])
    } finally { await actual.page.close() }
  })
})
