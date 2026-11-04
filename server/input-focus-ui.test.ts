import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'rolldown'
import type { Page } from 'playwright-core'
import { connectTestBrowser } from './test-browser.ts'

test('input autofocus follows observed keyboard use on touch devices', { timeout: 60_000 }, async t => {
  const source = `
import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SearchPanel} from ${JSON.stringify(new URL('../src/components/SearchPanel.tsx', import.meta.url).pathname)};
import {MentionTextarea} from ${JSON.stringify(new URL('../src/components/MentionTextarea.tsx', import.meta.url).pathname)};
import {canAutoFocusInput,startInputFocusTracking} from '@mew/ui/input-focus';
import {setUiLocale} from '@mew/ui/i18n-core';
import {matchesShortcut,getBinding} from '@mew/shortcuts';
setUiLocale('en');
function Fixture(){
  const [signal,setSignal]=useState(0),[mode,setMode]=useState('files'),[composer,setComposer]=useState(false),[draft,setDraft]=useState('');
  useEffect(()=>{
    const shortcut=event=>{
      const content=matchesShortcut(event,getBinding('projectSearch'));
      if(!content&&!matchesShortcut(event,getBinding('quickOpen')))return;
      event.preventDefault();window.allowedAtShortcut=canAutoFocusInput();setMode(content?'content':'files');setSignal(value=>value+1);
    };
    window.addEventListener('keydown',shortcut);
    let stop=startInputFocusTracking();
    window.stopTracking=()=>stop();window.restartTracking=()=>{stop();stop=startInputFocusTracking()};
    window.autofocusAllowed=canAutoFocusInput;window.focusReady=true;
    return ()=>{stop();window.removeEventListener('keydown',shortcut)};
  },[]);
  return <>
    <button id="outside">Outside</button>
    <button id="open-search" onClick={()=>setSignal(value=>value+1)}>Open search</button>
    <button id="open-composer" onClick={()=>setComposer(true)}>Open composer</button>
    <output id="signal">{signal}</output>
    <SearchPanel focusSignal={signal} readOnly project=".workspace" scope="root" scopes={[]} mode={mode} onModeChange={setMode} onOpenResult={()=>{}} onReplaced={()=>{}}>{()=>null}</SearchPanel>
    {composer&&<div style={{display:'flex',height:100}}><MentionTextarea value={draft} onChange={setDraft} options={[]} imageCapable autoFocus submitHint="Agent input"/></div>}
  </>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);`
  const bundle = await build({
    input: 'virtual:input-focus.tsx', write: false, platform: 'browser',
    output: { format: 'iife', codeSplitting: false },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) },
    plugins: [{ name: 'input-focus-fixture', resolveId(id) {
      if (id === 'virtual:input-focus.tsx') return id
      if (id.endsWith('.css')) return 'virtual:style'
    }, load(id) {
      if (id === 'virtual:input-focus.tsx') return source
      if (id === 'virtual:style') return ''
    } }],
  })
  const code = bundle.output.filter(item => item.type === 'chunk').map(item => item.code).join('\n')
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  const errors: string[] = []
  const openPage = async (width: number, touch = true) => {
    const page = await browser.newPage({ viewport: { width, height: 800 }, hasTouch: touch, isMobile: touch })
    page.setDefaultTimeout(5000)
    page.on('pageerror', error => errors.push(error.message))
    await page.route('http://mew-input-focus.test/**', route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: code })
      if (path.startsWith('/api/')) return route.fulfill({ json: { state: 'ready', version: 1, results: [] } })
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>.cm-editor{width:300px;min-height:70px}.cm-content{min-height:50px}</style><div id="root"></div><script src="/app.js"></script>' })
    })
    await page.goto('http://mew-input-focus.test/')
    await page.waitForFunction('window.focusReady===true')
    return page
  }
  const focused = (page: Page) => page.locator('[data-explorer-search-bar] input').evaluate(el => el === el.ownerDocument.activeElement)
  const allowed = (page: Page) => page.evaluate<boolean>('window.autofocusAllowed()')
  const touchSearch = async (page: Page, signal = 1) => {
    await page.locator('#open-search').tap()
    await page.waitForFunction(`document.getElementById('signal').textContent === '${signal}'`)
  }

  await t.test('desktop autofocus works before any keyboard input', async () => {
    const page = await openPage(1100, false)
    try {
      assert.equal(await allowed(page), true)
      await page.locator('#open-search').click()
      await page.waitForFunction('document.querySelector("[data-explorer-search-bar] input") === document.activeElement')
      assert.equal(await focused(page), true)
    } finally { await page.close() }
  })

  await t.test('narrow and wide touch-only devices keep opening search unfocused', async () => {
    for (const width of [390, 1100]) {
      const page = await openPage(width)
      try {
        assert.equal(await allowed(page), false)
        await touchSearch(page)
        assert.equal(await focused(page), false, `${width}px touch view does not summon the software keyboard`)
        await page.locator('#open-composer').tap()
        const input = page.locator('.cm-content[contenteditable=true]')
        await input.waitFor()
        assert.equal(await input.evaluate(el => el === el.ownerDocument.activeElement), false)
      } finally { await page.close() }
    }
  })

  await t.test('the first Ctrl/Cmd+P focuses search and selects its existing query', async () => {
    for (const shortcut of ['Control+p', 'Meta+p']) {
      const page = await openPage(390)
      try {
        const input = page.locator('[data-explorer-search-bar] input')
        await input.fill('existing query')
        await page.locator('#outside').focus()
        assert.equal(await allowed(page), false, 'programmatic filling does not prove keyboard use')
        await page.keyboard.press(shortcut)
        await page.waitForFunction('document.querySelector("[data-explorer-search-bar] input") === document.activeElement')
        assert.equal(await page.evaluate('window.allowedAtShortcut'), true, 'capture observes this first shortcut before the bubble handler')
        assert.deepEqual(await input.evaluate(el => ({ start: el.selectionStart, end: el.selectionEnd })), { start: 0, end: 14 })
        await page.locator('#outside').focus()
        await page.keyboard.press('Control+Shift+f')
        await page.getByRole('textbox', { name: 'Search file contents', exact: true }).waitFor()
        assert.equal(await focused(page), true, 'content search uses the same keyboard focus policy')
      } finally { await page.close() }
    }
  })

  await t.test('observed keyboard use survives touch opening search and the deferred agent input', async () => {
    const page = await openPage(390)
    try {
      await page.keyboard.press('ArrowDown')
      assert.equal(await allowed(page), true)
      await touchSearch(page)
      assert.equal(await focused(page), true)
      await page.locator('#open-composer').tap()
      const input = page.locator('.cm-content[contenteditable=true]')
      await input.waitFor()
      await page.waitForFunction('document.querySelector(".cm-content") === document.activeElement')
      await page.keyboard.type('ready to type')
      assert.equal(await input.innerText(), 'ready to type')
    } finally { await page.close() }
  })

  await t.test('a modifier shortcut is sufficient when the browser omits the physical key code', async () => {
    const page = await openPage(390)
    const session = await page.context().newCDPSession(page)
    try {
      await session.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'p', code: '', windowsVirtualKeyCode: 80, modifiers: 2 })
      await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'p', code: '', windowsVirtualKeyCode: 80 })
      await page.waitForFunction('document.querySelector("[data-explorer-search-bar] input") === document.activeElement')
      assert.equal(await page.evaluate('window.allowedAtShortcut'), true)
      assert.equal(await allowed(page), true)
    } finally { await session.detach(); await page.close() }
  })

  await t.test('software-style, IME and synthetic key events do not enable autofocus', async () => {
    const page = await openPage(390)
    const session = await page.context().newCDPSession(page)
    try {
      for (const { key, code, windowsVirtualKeyCode } of [
        { key: 'a', code: '', windowsVirtualKeyCode: 65 },
        { key: 'a', code: 'Unidentified', windowsVirtualKeyCode: 65 },
        { key: 'Process', code: 'KeyA', windowsVirtualKeyCode: 229 },
        { key: 'a', code: 'KeyA', windowsVirtualKeyCode: 229 },
        { key: 'Unidentified', code: 'KeyA', windowsVirtualKeyCode: 65 },
        { key: 'Dead', code: 'Quote', windowsVirtualKeyCode: 222 },
        { key: '', code: 'KeyA', windowsVirtualKeyCode: 65 },
        { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 },
        { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 },
      ]) {
        await session.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode })
        await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode })
        assert.equal(await allowed(page), false, `${JSON.stringify({ key, code, windowsVirtualKeyCode })} is not keyboard evidence`)
      }
      await page.evaluate('window.stopTracking()')
      await page.locator('#outside').evaluate(el => {
        el.ownerDocument.defaultView!.addEventListener('keydown', (event: Event) => {
          Object.defineProperty(event, 'isComposing', { value: true })
        }, { capture: true, once: true })
      })
      await page.evaluate('window.restartTracking()')
      await page.keyboard.press('a')
      assert.equal(await allowed(page), false, 'a composing trusted physical-coded key is ignored')
      await page.locator('#outside').evaluate(el => {
        const win = el.ownerDocument.defaultView!
        win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'a', code: 'KeyA', bubbles: true }))
        win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'a', code: 'KeyA', isComposing: true, bubbles: true }))
      })
      assert.equal(await allowed(page), false, 'script-generated events cannot opt touch users into autofocus')
      await touchSearch(page)
      assert.equal(await focused(page), false)
    } finally { await session.detach(); await page.close() }
  })

  await t.test('cleanup resets capability and removes the keyboard listener', async () => {
    const page = await openPage(390)
    try {
      await page.keyboard.press('ArrowDown')
      assert.equal(await allowed(page), true)
      await page.evaluate('window.stopTracking()')
      assert.equal(await allowed(page), false)
      await page.keyboard.press('ArrowDown')
      assert.equal(await allowed(page), false, 'disposed tracking cannot observe later keys')
      await page.evaluate('window.restartTracking()')
      assert.equal(await allowed(page), false)
      await touchSearch(page)
      assert.equal(await focused(page), false, 'restarting does not retain old keyboard evidence')
      await page.keyboard.press('ArrowDown')
      assert.equal(await allowed(page), true)
      await page.reload()
      await page.waitForFunction('window.focusReady===true')
      assert.equal(await allowed(page), false, 'a new document does not retain keyboard evidence')
    } finally { await page.close() }
  })
  assert.deepEqual(errors, [])
})
