import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import express from 'express'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import type { Browser, Page } from 'playwright-core'
import { connectTestBrowser } from './test-browser.ts'

test('memo tabs isolate accounts, retain switched documents, confirm deletion and reopen on mobile', { timeout: 60_000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-private-memo-ui-'))
  process.env.MEW_DATA_DIR = directory
  const { attachCollabWebSocket } = await import('./collab.ts')
  const { createMemoTabRouter } = await import('./memo-tab-routes.ts')
  const { attachAuthContext, authorizeCollab } = await import('./reqAuth.ts')
  const { createSession, destroySession, upsertUser } = await import('./auth.ts')
  const firstAccount = 'memo-one@example.test', secondAccount = 'memo-two@example.test'
  for (const account of [firstAccount, secondAccount]) upsertUser(account, { hash: 'unused', role: 'member', createdAt: 0, passwordChangedAt: 0, mustChangePassword: false })
  const firstToken = createSession(firstAccount), secondToken = createSession(secondAccount)
  let cleanupBrowser: Browser | undefined, cleanupServer: http.Server | undefined
  t.after(async () => {
    await cleanupBrowser?.close()
    if (cleanupServer) await new Promise<void>(resolve => cleanupServer!.close(() => resolve()))
    destroySession(firstToken); destroySession(secondToken)
    await fs.rm(directory, { recursive: true, force: true })
  })
  const root = path.resolve(import.meta.dirname, '..')
  const source = `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {SharedMemo} from '${root}/src/components/shared-memo.tsx';
import {useSharedMemo} from '${root}/src/hooks/use-shared-memo.ts';
import {I18nProvider} from '${root}/src/i18n.tsx';
localStorage.setItem('mew:locale','ko');
function Fixture(){
 const [open,setOpen]=useState(false);
 const session=useSharedMemo({authEmail:new URLSearchParams(location.search).get('user')||'${firstAccount}',open,onOpenChange:setOpen});
 return <main style={{height:'100dvh',display:'flex',flexDirection:'column',minWidth:0}}>
 <button onClick={()=>setOpen(value=>!value)}>Open memo</button>
 <div style={{flex:1,minHeight:0,minWidth:0}}>{open&&<SharedMemo session={session} open={open}/>}</div>
 </main>
}
createRoot(document.getElementById('root')).render(<React.StrictMode><I18nProvider><Fixture/></I18nProvider></React.StrictMode>);`
  const bundle = await build({ onwarn(warning, next) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') next(warning) }, input: 'virtual:private-memo.tsx', write: false, platform: 'browser', output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'private-memo-fixture', resolveId(id) { if (id === 'virtual:private-memo.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' },
    load(id) { if (id === 'virtual:private-memo.tsx') return source; if (id === 'virtual:style') return '' },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const candidates = (await Promise.all([
    'src/components/shared-memo.tsx', 'src/components/PresenceDots.tsx', 'src/components/tool-presentation-toggle.tsx',
    'src/components/panel-close-button.tsx', 'packages/editor/src/Editor.tsx', 'packages/ui/src/tab-scroll-area.tsx',
    'packages/ui/src/ConfirmDialog.tsx', 'packages/ui/src/dialog-frame.tsx',
  ].map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set((source + candidates).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))]) + '\n' + (await Promise.all([
    'packages/editor/src/editor/editor.css', 'src/components/shared-memo.css', 'packages/ui/src/tab-scroll-area.css',
  ].map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const app = express()
  app.use('/api', express.json(), attachAuthContext)
  app.use('/api/memo-tabs', createMemoTabRouter())
  app.get('/app.js', (_req, res) => { res.type('text/javascript').send(chunk.code) })
  app.get('/', (_req, res) => { res.type('text/html').send(`<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/app.js"></script></html>`) })
  const server = http.createServer(app)
  attachCollabWebSocket(server as unknown as Parameters<typeof attachCollabWebSocket>[0], { authorize: authorizeCollab })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  cleanupServer = server
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}`
  const browser = await connectTestBrowser()
  cleanupBrowser = browser
  const errors: string[] = []
  const open = async (account: string, token: string, mobile = false) => {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1000, height: 720 }, hasTouch: mobile, isMobile: mobile })
    await context.addCookies([{ name: 'mew_session', value: token, url: base }])
    const page = await context.newPage()
    page.setDefaultTimeout(6000)
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${base}?user=${encodeURIComponent(account)}`)
    await page.getByRole('button', { name: 'Open memo', exact: true }).click()
    await page.getByRole('button', { name: '개인 메모 추가', exact: true }).waitFor()
    await page.locator('.tiptap[contenteditable=true]:visible').waitFor()
    return { context, page }
  }
  const tab = (page: Page, name: string) => page.getByRole('tab').filter({ has: page.getByText(name, { exact: true }) })
  const selected = async (page: Page, name: string) => { assert.equal(await tab(page, name).getAttribute('aria-selected'), 'true') }
  const editorText = (page: Page) => page.locator('.tiptap:visible').evaluate(el => {
    const copy = el.cloneNode(true) as { textContent: string | null; querySelectorAll(selector: string): Iterable<{ remove(): void }> }
    for (const label of copy.querySelectorAll('.collaboration-carets__label')) label.remove()
    return copy.textContent?.trim() ?? ''
  })
  const waitForEditorText = (page: Page, text: string) => page.locator('.tiptap:visible').evaluate((el, expected) => new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + 5000
    const check = () => {
      const copy = el.cloneNode(true) as { textContent: string | null; querySelectorAll(selector: string): Iterable<{ remove(): void }> }
      for (const label of copy.querySelectorAll('.collaboration-carets__label')) label.remove()
      const content = copy.textContent?.trim() ?? ''
      if (content.includes(expected)) { resolve(); return }
      if (Date.now() >= deadline) { reject(new Error(`Expected memo text ${JSON.stringify(expected)}, received ${JSON.stringify(content)}`)); return }
      el.ownerDocument.defaultView!.setTimeout(check, 20)
    }
    check()
  }), text)
  const type = async (page: Page, text: string) => {
    const editor = page.locator('.shared-memo .tiptap[contenteditable=true]:visible')
    await editor.waitFor(); await editor.click(); await page.keyboard.type(text)
    await waitForEditorText(page, text)
  }
  const one = await open(firstAccount, firstToken)
  const other = await open(secondAccount, secondToken)
  await selected(one.page, '공용')
  assert.equal(await tab(one.page, '공용').getByRole('button', { name: '메모 삭제', exact: true }).count(), 0)
  await type(one.page, 'Shared between accounts')
  await waitForEditorText(other.page, 'Shared between accounts')
  await one.page.getByRole('button', { name: '개인 메모 추가', exact: true }).click()
  await tab(one.page, '개인 메모 1').waitFor()
  await selected(one.page, '개인 메모 1')
  await type(one.page, 'Owner private one')
  assert.equal(await other.page.getByRole('tab').count(), 1, 'another account never lists the private tab')
  assert.equal(await editorText(other.page), 'Shared between accounts')
  await one.page.getByRole('button', { name: '개인 메모 추가', exact: true }).click()
  await tab(one.page, '개인 메모 2').waitFor()
  await selected(one.page, '개인 메모 2')
  await type(one.page, 'Owner private two')
  await tab(one.page, '개인 메모 1').click()
  await waitForEditorText(one.page, 'Owner private one')
  assert.equal(await editorText(one.page), 'Owner private one', 'switching tabs retains only the selected document')
  await one.page.locator('.tiptap:visible').click()
  await one.page.keyboard.press('Control+z')
  assert.equal((await editorText(one.page)).trim(), '', 'undo history survives switching to another memo and back')
  await one.page.keyboard.press('Control+Shift+z')
  await waitForEditorText(one.page, 'Owner private one')

  const sameAccount = await open(firstAccount, firstToken)
  await tab(sameAccount.page, '개인 메모 1').click()
  await waitForEditorText(sameAccount.page, 'Owner private one')
  assert.equal(await sameAccount.page.getByRole('tab').count(), 3, 'the same account discovers persisted tab metadata')
  await tab(one.page, '개인 메모 2').click()
  const remoteEditor = sameAccount.page.locator('.tiptap:visible')
  await remoteEditor.click(); await remoteEditor.press('Control+a'); await remoteEditor.press('Backspace')
  assert.equal((await editorText(sameAccount.page)).trim(), '')
  await tab(one.page, '개인 메모 1').click()
  assert.equal((await editorText(one.page)).trim(), '', 'remote deletion of all text in an inactive memo never restores its previous value')
  await one.page.getByRole('button', { name: 'Plain', exact: true }).click()
  assert.equal((await one.page.locator('.cm-content:visible').innerText()).trim(), '', 'Plain also serializes the remotely emptied inactive document')
  await one.page.getByRole('button', { name: 'Hotview', exact: true }).click()
  await type(one.page, 'Keep after failed delete')
  await waitForEditorText(sameAccount.page, 'Keep after failed delete')
  await sameAccount.page.locator('.tiptap:visible .collaboration-carets__caret').waitFor({ state: 'attached' })
  await one.page.locator('.tiptap:visible').press('End')
  await one.page.keyboard.type('!')
  await waitForEditorText(sameAccount.page, 'Keep after failed delete!')
  assert.ok(await sameAccount.page.locator('.tiptap:visible .collaboration-carets__caret').count(), 'editing retains the remote awareness caret')
  await tab(one.page, '개인 메모 1').getByRole('button', { name: '메모 삭제', exact: true }).click()
  const dialog = one.page.getByRole('dialog', { name: '이 개인 메모를 삭제할까요?' })
  await dialog.getByRole('button', { name: '취소', exact: true }).click()
  await selected(one.page, '개인 메모 1')
  assert.equal(await tab(one.page, '개인 메모 1').count(), 1)
  const deletionPattern = '**/api/memo-tabs/*'
  await one.page.route(deletionPattern, route => route.request().method() === 'DELETE'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Delete failed' }) }) : route.continue())
  await tab(one.page, '개인 메모 1').getByRole('button', { name: '메모 삭제', exact: true }).click()
  await dialog.getByRole('button', { name: '삭제', exact: true }).click()
  await one.page.getByRole('alert').filter({ hasText: 'Delete failed' }).waitFor()
  await selected(one.page, '개인 메모 1')
  assert.equal(await editorText(one.page), 'Keep after failed delete!', 'a failed delete retains the tab and its content')
  await one.page.unroute(deletionPattern)
  await tab(one.page, '개인 메모 1').getByRole('button', { name: '메모 삭제', exact: true }).click()
  await dialog.getByRole('button', { name: '삭제', exact: true }).click()
  await tab(one.page, '개인 메모 1').waitFor({ state: 'detached' })
  await selected(one.page, '공용')
  await waitForEditorText(one.page, 'Shared between accounts')
  await sameAccount.page.bringToFront()
  await tab(sameAccount.page, '개인 메모 1').waitFor({ state: 'detached' })
  await selected(sameAccount.page, '공용')
  await waitForEditorText(sameAccount.page, 'Shared between accounts')
  await tab(one.page, '개인 메모 2').click()
  await waitForEditorText(one.page, 'Owner private two')
  if (process.env.MEW_MEMO_SCREENSHOT_DIR) {
    await fs.mkdir(process.env.MEW_MEMO_SCREENSHOT_DIR, { recursive: true })
    await one.page.screenshot({ path: path.join(process.env.MEW_MEMO_SCREENSHOT_DIR, 'private-memo-desktop-dark.png') })
  }
  await one.context.close(); await sameAccount.context.close()

  const reopened = await open(firstAccount, firstToken, true)
  assert.equal(await tab(reopened.page, '개인 메모 1').count(), 0, 'confirmed deletion survives page reopen')
  await tab(reopened.page, '개인 메모 2').click()
  await waitForEditorText(reopened.page, 'Owner private two')
  assert.equal(await editorText(reopened.page), 'Owner private two', 'private content survives all account pages closing')
  const memo = reopened.page.getByRole('region', { name: '메모', exact: true })
  assert.ok(await memo.evaluate(el => el.scrollWidth <= el.clientWidth), 'the memo fits the 390px mobile viewport')
  assert.ok(await reopened.page.locator('html').evaluate(el => el.scrollWidth <= el.clientWidth), 'the tab strip never causes document overflow')
  await reopened.page.getByRole('button', { name: '개인 메모 추가', exact: true }).scrollIntoViewIfNeeded()
  assert.ok(await reopened.page.getByRole('button', { name: '개인 메모 추가', exact: true }).isVisible(), 'the add tab stays reachable on mobile')
  if (process.env.MEW_MEMO_SCREENSHOT_DIR) await reopened.page.screenshot({ path: path.join(process.env.MEW_MEMO_SCREENSHOT_DIR, 'private-memo-mobile-dark.png') })
  const add = reopened.page.getByRole('button', { name: '개인 메모 추가', exact: true })
  for (let index = 0; index < 3; index++) {
    await add.scrollIntoViewIfNeeded()
    await add.click()
    await reopened.page.getByRole('tab').nth(index + 2).waitFor()
  }
  const viewport = reopened.page.locator('.mew-tab-scroll-viewport')
  assert.ok(await viewport.evaluate(el => el.scrollWidth > el.clientWidth), 'many private tabs overflow inside the shared tab viewport')
  const left = reopened.page.getByRole('button', { name: '탭을 왼쪽으로 스크롤', exact: true })
  const right = reopened.page.getByRole('button', { name: '탭을 오른쪽으로 스크롤', exact: true })
  await left.waitFor()
  const offset = await viewport.evaluate(el => el.scrollLeft)
  await left.dispatchEvent('click', { detail: 0 })
  assert.ok(await viewport.evaluate(el => el.scrollLeft) < offset, 'the common left arrow scrolls the overflowing memo tabs')
  await right.waitFor()
  const beforeRight = await viewport.evaluate(el => el.scrollLeft)
  await right.dispatchEvent('click', { detail: 0 })
  assert.ok(await viewport.evaluate(el => el.scrollLeft) > beforeRight, 'the common right arrow scrolls back toward the add tab')
  await add.scrollIntoViewIfNeeded()
  const bounds = await add.boundingBox()
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390, 'the add button stays reachable after the tab strip overflows')
  assert.ok(await reopened.page.locator('html').evaluate(el => el.scrollWidth <= el.clientWidth), 'overflowing tabs never widen the mobile document')
  if (process.env.MEW_MEMO_SCREENSHOT_DIR) {
    await memo.evaluate(el => el.ownerDocument.documentElement.classList.remove('dark'))
    await reopened.page.screenshot({ path: path.join(process.env.MEW_MEMO_SCREENSHOT_DIR, 'private-memo-mobile-light-overflow.png') })
  }
  await other.context.close(); await reopened.context.close()
  assert.deepEqual(errors, [])
})
