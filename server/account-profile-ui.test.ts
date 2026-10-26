import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')
const email = 'profile.long-email+abcdefghijklmnop@example.test'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
const avatarDataUrl = `data:image/png;base64,${png.toString('base64')}`

test('profile avatar menu supports compact layouts, file and clipboard changes, validation and saving', { skip: !domBrowserExecutable(), timeout: 45_000 }, async () => {
  const source = `
import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {AccountProfileForm} from '${root}/src/components/account-profile-form.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {applyThemePalette,THEME_PRESETS} from '${root}/src/utils/theme-color.ts';
localStorage.setItem('mew:locale','ko');
applyThemePalette(THEME_PRESETS.find(theme=>theme.id==='midnight').palette);
window.profileChanges=[];window.clipboardMode='image';window.clipboardReads=0;
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{read:async()=>{
 window.clipboardReads++;
 if(window.clipboardMode==='reject')throw new DOMException('Clipboard access denied','NotAllowedError');
 if(window.clipboardMode==='empty')return [{types:['text/plain'],getType:async()=>new Blob(['text'],{type:'text/plain'})}];
 const data=Uint8Array.from(atob('${png.toString('base64')}'),char=>char.charCodeAt(0));
 return [{types:['image/png'],getType:async()=>new Blob([data],{type:'image/png'})}];
}}});
createRoot(document.getElementById('fixture')).render(<I18nProvider><AccountProfileForm email='${email}' displayName='Sanghun' avatarDataUrl='${avatarDataUrl}' onProfileChanged={profile=>window.profileChanges.push(profile)}/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:profile.tsx', write: false, platform: 'browser', onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{
    name: 'profile-fixture',
    resolveId(id) { if (id === 'virtual:profile.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' },
    async load(id) { if (id === 'virtual:profile.tsx') return source; if (id === 'virtual:style') return ''; if (id.endsWith('?raw')) return 'export default ' + JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8')) },
  }] })
  const content = (await Promise.all(['src/components/account-profile-form.tsx', 'packages/ui/src/action-menu.tsx'].map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@:/.[\]()%,-]+/g))])
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  const screenshots = process.env.MEW_ACCOUNT_PROFILE_SCREENSHOTS
  if (screenshots) await fs.mkdir(screenshots, { recursive: true })
  const payloads: { displayName: string; avatarDataUrl: string | null }[] = []
  let failNext = false
  let holdNext = false
  let releaseSave: (() => void) | undefined
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
    page.setDefaultTimeout(4000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('http://mew-profile.test/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/auth/profile') {
        assert.equal(route.request().method(), 'PUT')
        const payload = route.request().postDataJSON() as typeof payloads[number]
        payloads.push(payload)
        if (holdNext) { holdNext = false; await new Promise<void>(resolve => { releaseSave = resolve }) }
        if (failNext) { failNext = false; return route.fulfill({ status: 500, json: { error: '프로필 저장 테스트 실패' } }) }
        return route.fulfill({ json: { ok: true, profile: { email, displayName: payload.displayName.trim(), avatarDataUrl: payload.avatarDataUrl } } })
      }
      if (url.pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: bundle.output.find(item => item.type === 'chunk')!.code })
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{margin:0;background:var(--color-surface);color:var(--color-ink);font:14px sans-serif}#fixture{box-sizing:border-box;width:100%;max-width:640px;padding:12px}</style><main id="fixture"></main><script src="/app.js"></script></html>` })
    })
    await page.goto('http://mew-profile.test/')
    const avatar = page.getByRole('button', { name: '프로필 사진 변경', exact: true })
    const name = page.getByRole('textbox', { name: '표시 이름', exact: true })
    const save = page.getByRole('button', { name: '저장', exact: true })
    const menu = page.getByRole('menu')
    await avatar.waitFor()
    for (const width of [1100, 390, 320]) {
      await page.setViewportSize({ width, height: 800 })
      const avatarBox = await avatar.boundingBox(), nameBox = await name.boundingBox(), saveBox = await save.boundingBox()
      const headingBox = await page.getByText('내 계정', { exact: true }).boundingBox(), emailBox = await page.getByText(email, { exact: true }).boundingBox()
      assert.ok(avatarBox && nameBox && saveBox && headingBox && emailBox)
      assert.ok(headingBox.x >= avatarBox.x + avatarBox.width && emailBox.x >= avatarBox.x + avatarBox.width, JSON.stringify({ width, avatarBox, headingBox, emailBox }))
      assert.ok(nameBox.x >= avatarBox.x + avatarBox.width && nameBox.y >= emailBox.y + emailBox.height - 1, JSON.stringify({ width, avatarBox, emailBox, nameBox }))
      assert.ok(saveBox.x >= nameBox.x + nameBox.width && Math.abs(saveBox.y - nameBox.y) <= 1, JSON.stringify({ width, nameBox, saveBox }))
      assert.equal(await page.locator('html').evaluate(el => el.scrollWidth <= el.clientWidth), true, `no horizontal overflow at ${width}px`)
      await avatar.click()
      await menu.waitFor()
      assert.equal(await avatar.getAttribute('aria-expanded'), 'true')
      assert.equal(await avatar.getAttribute('aria-haspopup'), 'menu')
      const menuBox = await menu.boundingBox()
      assert.ok(menuBox && menuBox.x >= 4 && menuBox.x + menuBox.width <= width - 4)
      assert.deepEqual(await menu.getByRole('menuitem').allTextContents(), ['기본', '사진 선택', '클립보드에서 붙여넣기'])
      if (screenshots) await page.screenshot({ path: path.join(screenshots, `profile-menu-${width}.png`) })
      await page.keyboard.press('Escape')
      await menu.waitFor({ state: 'hidden' })
      assert.equal(await avatar.evaluate(el => el.ownerDocument.activeElement === el), true)
      assert.equal(await avatar.locator('svg').evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el.parentElement!).opacity), '1', 'keyboard focus reveals the edit overlay')
      if (screenshots) await page.screenshot({ path: path.join(screenshots, `profile-${width}.png`) })
    }

    await avatar.press('ArrowDown')
    await menu.waitFor()
    await page.keyboard.press('Home')
    await page.keyboard.press('Enter')
    await menu.waitFor({ state: 'hidden' })
    assert.equal(await avatar.locator('img').count(), 0)
    await avatar.click()
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), menu.getByRole('menuitem', { name: '사진 선택', exact: true }).click()])
    await chooser.setFiles({ name: 'profile.png', mimeType: 'image/png', buffer: png })
    await avatar.locator('img').waitFor()
    assert.equal(await avatar.locator('img').getAttribute('src'), avatarDataUrl)
    const file = page.locator('input[type=file]')
    await file.setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(512 * 1024 + 1) })
    await page.getByRole('alert').getByText(/512KB/).waitFor()
    assert.equal(await avatar.locator('img').getAttribute('src'), avatarDataUrl, 'oversized uploads preserve the previous preview')
    await file.setInputFiles({ name: 'unsupported.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') })
    await page.getByRole('alert').getByText(/512KB/).waitFor()
    assert.equal(await avatar.locator('img').getAttribute('src'), avatarDataUrl, 'unsupported uploads preserve the previous preview')

    await avatar.click()
    await menu.getByRole('menuitem', { name: '기본', exact: true }).click()
    await avatar.click()
    await menu.getByRole('menuitem', { name: '클립보드에서 붙여넣기', exact: true }).click()
    await avatar.locator('img').waitFor()
    assert.equal(await avatar.locator('img').getAttribute('src'), avatarDataUrl)
    assert.equal(await page.evaluate('window.clipboardReads'), 1)
    for (const mode of ['empty', 'reject']) {
      await page.evaluate(`window.clipboardMode='${mode}'`)
      await avatar.click()
      await menu.getByRole('menuitem', { name: '클립보드에서 붙여넣기', exact: true }).click()
      await page.getByRole('alert').getByText(mode === 'empty' ? /클립보드에 사진이 없습니다/ : /브라우저 권한을 확인/).waitFor()
      assert.equal(await page.evaluate('window.clipboardReads'), mode === 'empty' ? 2 : 3)
      assert.equal(await avatar.locator('img').getAttribute('src'), avatarDataUrl, `${mode} clipboard result preserves the previous preview`)
    }

    await name.fill('  New profile  ')
    holdNext = true
    await save.click()
    await page.getByRole('button', { name: '저장 중…', exact: true }).waitFor()
    assert.equal(await avatar.isDisabled(), true)
    assert.equal(await name.isDisabled(), true)
    assert.equal(await page.getByRole('button', { name: '저장 중…', exact: true }).isDisabled(), true)
    releaseSave!()
    await page.getByRole('status').getByText('프로필을 저장했습니다', { exact: true }).waitFor()
    assert.deepEqual(payloads.at(-1), { displayName: '  New profile  ', avatarDataUrl })
    assert.equal(await name.inputValue(), 'New profile')
    assert.deepEqual(await page.evaluate('window.profileChanges'), [{ email, displayName: 'New profile', avatarDataUrl }])

    failNext = true
    await name.fill('Unsaved name')
    await save.click()
    await page.getByRole('alert').getByText('프로필 저장 테스트 실패', { exact: true }).waitFor()
    assert.equal(await name.inputValue(), 'Unsaved name')
    assert.equal(await avatar.locator('img').getAttribute('src'), avatarDataUrl)
    assert.equal(await page.evaluate('window.profileChanges.length'), 1, 'failed saves do not update the signed-in profile')
    await avatar.click()
    await menu.getByRole('menuitem', { name: '기본', exact: true }).click()
    await save.click()
    await page.getByRole('status').waitFor()
    assert.deepEqual(payloads.at(-1), { displayName: 'Unsaved name', avatarDataUrl: null })
    assert.deepEqual(errors, [])
  } finally { releaseSave?.(); await browser.close() }
})
