import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'
import { MewpetSkinStore } from './mewpet-skins.ts'
import { MEWPET_ANIMATIONS } from '../shared/mewpet-skins.ts'

const root = path.resolve(import.meta.dirname, '..')
test('header notifications work without Mewcat and settings separate the optional cat channel', { timeout: 30_000 }, async () => {
  const source = `import React,{useState,useRef} from 'react';import {createRoot} from 'react-dom/client';
import {I18nProvider} from '${root}/src/i18n.tsx';import {HeaderMenu} from '${root}/src/components/HeaderMenu.tsx';
import {SettingsModal} from '${root}/src/components/SettingsModal.tsx';import {Mewcat} from '${root}/src/components/Mewcat.tsx';import {publishMewcatNotice} from '${root}/src/utils/mewcat-notifications.ts';
window.addEventListener('mew:open-notification',event=>window.openedNotice=event.detail.target);
function Fixture(){const [settings,setSettings]=useState(false),[cat,setCat]=useState(null),counter=useRef(0);return <><header style={{height:40,display:'flex',justifyContent:'flex-end',alignItems:'center',gap:8}}><span aria-label="활성 세션">1</span><HeaderMenu notifications items={[{id:"settings",label:"설정",icon:<span/>,onSelect:()=>setSettings(true)}]}/><button onClick={()=>setSettings(true)}>Settings</button></header><button onClick={()=>publishMewcatNotice({key:'header:'+counter.current++,kind:'error',level:'danger',source:'Codex',target:{tabId:'agent',cwd:'/fixture'}})}>Send notice</button><button onClick={()=>setCat(cat?null:'capybara')}>Toggle cat</button><Mewcat skin={cat}/>{settings&&<SettingsModal canEditIgnore={false} fontPreferences={{ui:'Arial',markdown:'Arial',mono:'monospace'}} mewcatSkin={cat} mewcatHideDesktop={false} onClose={()=>setSettings(false)} onFontPreferencesChange={()=>{}} onMewcatSkinChange={setCat} onMewcatHideDesktopChange={()=>{}}/>}</>}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:header.tsx', write: false, platform: 'browser', onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) }, output: { format: 'iife', codeSplitting: false }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{ name: 'fixture', async resolveId(id, importer) { if (id === 'virtual:header.tsx') return id; if (id.endsWith('.css')) return 'virtual:style'; if (id.endsWith('?raw')) { const resolved = await this.resolve(id.slice(0, -4), importer, { skipSelf: true }); if (resolved) return `${resolved.id}?raw` } }, async load(id) { if (id === 'virtual:header.tsx') return source; if (id === 'virtual:style') return ''; if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}` } }] })
  const files = ['src/components/HeaderMenu.tsx','src/components/header-menu-popup.tsx','src/components/header-notifications.tsx','src/components/SettingsModal.tsx','src/components/mewcat-notifications.tsx','packages/ui/src/dialog-frame.tsx','packages/ui/src/select-field.tsx']
  const content = source + (await Promise.all(files.map(file => fs.readFile(`${root}/${file}`, 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set(content.match(/[A-Za-z0-9_@:/.[\]()%,-]+/g))]) + await fs.readFile(`${root}/src/components/workspace-menu.css`, 'utf8')
  const browser = await connectTestBrowser()
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } }); page.setDefaultTimeout(4000)
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript("localStorage.setItem('mew:locale','ko')")
    const petStore = new MewpetSkinStore('')
    await page.route('http://mew-notices.test/**', route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname === '/api/mewpet/skins') return route.fulfill({ json: { ...petStore.list(), canManage: false } })
      const action = MEWPET_ANIMATIONS.find(action => pathname === `/api/mewpet/skins/capybara/${action}`)
      if (action) { const image = petStore.image('capybara', action); return route.fulfill({ contentType: image.mime, body: image.bytes }) }
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script>${bundle.output.find(item=>item.type==='chunk')!.code}</script></html>` })
    })
    await page.goto('http://mew-notices.test/')
    const menu = page.getByRole('button', { name: '메뉴', exact: true })
    const badge = menu.locator('[data-menu-notification-count]')
    const popup = page.getByRole('menu', { name: '메뉴', exact: true })
    const openHistory = async () => {
      await menu.click()
      await popup.getByRole('menuitem', { name: '전체 보기', exact: true }).click()
    }
    assert.equal(await badge.count(), 0)
    await page.getByRole('button', { name: 'Send notice' }).click(); await badge.waitFor()
    assert.equal(await page.locator('.mewcat').count(), 0)
    const menuRect = (await menu.boundingBox())!, sessions = (await page.getByLabel('활성 세션').boundingBox())!
    assert.ok(sessions.x + sessions.width <= menuRect.x, 'unread count appears on the menu beside active sessions')
    await openHistory()
    const notices = page.getByRole('dialog', { name: '알림', exact: true }); await notices.waitFor()
    await page.screenshot({ path: '/tmp/mew-header-notifications-desktop.png' })
    await notices.getByRole('button', { name: /에이전트.*오류/ }).click()
    assert.deepEqual(await page.evaluate('window.openedNotice'), { tabId: 'agent', cwd: '/fixture' })
    assert.equal(await badge.count(), 0)
    await page.getByRole('button', { name: 'Send notice' }).click()
    await page.getByRole('button', { name: 'Settings' }).click()
    const settings = page.getByRole('dialog', { name: '설정', exact: true })
    await settings.getByRole('button', { name: '알림', exact: true }).click()
    assert.equal(await settings.getByRole('checkbox', { name: '앱 내 알림' }).isChecked(), true)
    assert.equal(await settings.getByRole('checkbox', { name: '토스트 알림' }).count(), 0)
    await settings.getByRole('checkbox', { name: '앱 내 알림' }).uncheck(); assert.equal(await badge.count(), 0)
    await settings.getByRole('checkbox', { name: '앱 내 알림' }).check()
    await settings.getByRole('button', { name: '뮤펫', exact: true }).click()
    assert.equal(await settings.getByRole('checkbox', { name: '앱 내 알림' }).count(), 0, 'notifications moved out of the cat tab')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Toggle cat' }).click(); await page.locator('.mewcat').waitFor()
    await page.getByRole('button', { name: 'Settings' }).click()
    await settings.getByRole('button', { name: '알림', exact: true }).click()
    await settings.getByRole('checkbox', { name: '토스트 알림' }).uncheck()
    await page.screenshot({ path: '/tmp/mew-notification-settings-desktop.png' })
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('status').filter({ hasText: /에이전트.*오류/ }).count(), 0)
    assert.equal(await badge.count(), 1)
    await page.reload(); await page.getByRole('button', { name: 'Send notice' }).click()
    await page.getByRole('button', { name: 'Toggle cat' }).click()
    assert.equal(await page.getByRole('status').filter({ hasText: /에이전트.*오류/ }).count(), 0, 'toast preference survives reload')
    await page.setViewportSize({ width: 320, height: 720 }); await page.locator('html').evaluate(el => el.classList.remove('dark'))
    await openHistory(); await notices.waitFor()
    const bounds = (await notices.boundingBox())!; assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 320)
    await page.screenshot({ path: '/tmp/mew-header-notifications-mobile.png' })
    await page.keyboard.press('Escape'); assert.equal(await menu.evaluate(el => el === el.ownerDocument.activeElement), true)
    await openHistory(); await notices.getByRole('button', { name: '모두 확인', exact: true }).click()
    assert.equal(await badge.count(), 0)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Settings' }).click()
    await settings.getByRole('button', { name: '알림', exact: true }).click()
    assert.equal(await settings.getByRole('checkbox', { name: '토스트 알림' }).isChecked(), false)
    await page.screenshot({ path: '/tmp/mew-notification-settings-mobile.png' })
    await page.keyboard.press('Escape')
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
