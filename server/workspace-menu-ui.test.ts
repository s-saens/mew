import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')
test('workspace menu groups compact actions, limits notification previews, and preserves keyboard/touch navigation', { timeout: 60_000 }, async t => {
  const source = `import React from 'react';import {createRoot} from 'react-dom/client';
import {I18nProvider,useI18n} from '${root}/src/i18n.tsx';
import {HeaderMenu} from '${root}/src/components/HeaderMenu.tsx';
import {publishMewcatNotice,setNotificationPreferences,clearMewcatNotices} from '${root}/src/utils/mewcat-notifications.ts';
window.actions=[];window.clearNotices=clearMewcatNotices;window.setNotificationPreferences=setNotificationPreferences;
window.addEventListener('mew:open-notification',e=>window.actions.push(e.detail.source));
for(let i=0;i<6;i++)publishMewcatNotice({key:'notice-'+i,kind:'error',level:i===1?'danger':'success',source:'Agent '+i,target:{tabId:'agent-'+i,cwd:'/example'}});
function Fixture(){const {setLocale}=useI18n();window.setLocale=setLocale;const items=[
{id:'admin',group:'account',label:'계정 관리',icon:null,onSelect:()=>window.actions.push('admin')},
...['원격 데스크톱','원격 브라우저','서버 파일 탐색기','예약 작업'].map((label,i)=>({id:'tool'+i,group:'tools',label,icon:null,hint:i===2?'Alt+E':i===3?'Alt+S':undefined,onSelect:()=>window.actions.push(label)})),
...['업데이트','Mewlink','설정'].map((label,i)=>({id:'mew'+i,group:'mew',label,icon:null,hint:i===0?'Ctrl+U':undefined,onSelect:()=>window.actions.push(label)}))];return <><header className="flex h-10 justify-end px-2"><HeaderMenu notifications account={{email:'alex@example.test',displayName:'Alex Kim',avatarDataUrl:'data:image/png;base64,broken',onSelect:()=>window.actions.push('profile')}} items={items}/></header><main tabIndex={-1}>Workspace</main><div className="mobile-dock fixed inset-x-0 bottom-0 h-12 md:hidden">Dock</div></>}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:workspace-menu.tsx', write: false, platform: 'browser', output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{ name: 'fixture', resolveId(id) { if (id === 'virtual:workspace-menu.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' }, load(id) { if (id === 'virtual:workspace-menu.tsx') return source; if (id === 'virtual:style') return '' } }] })
  const files = ['src/components/HeaderMenu.tsx', 'src/components/header-menu-popup.tsx', 'src/components/header-notifications.tsx', 'packages/ui/src/dialog-frame.tsx']
  const content = source + (await Promise.all(files.map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set(content.match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))]) + await fs.readFile(path.join(root, 'src/components/workspace-menu.css'), 'utf8')
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  for (const width of [1100, 390, 320]) for (const dark of [false, true]) {
    const page = await browser.newPage({ viewport: { width, height: 740 }, hasTouch: width < 768 })
    page.setDefaultTimeout(4000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript("localStorage.setItem('mew:locale','ko')")
    await page.route('http://mew-workspace-menu.test/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="${dark ? 'dark' : ''}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script>${bundle.output.find(item => item.type === 'chunk')!.code}</script></html>` }))
    await page.goto('http://mew-workspace-menu.test/')
    const trigger = page.getByRole('button', { name: '메뉴', exact: true })
    assert.equal(await page.locator('header [data-menu-notification-count]').innerText(), '6')
    assert.equal(await page.locator('header button').count(), 1, 'notifications share the hamburger trigger')
    assert.equal(await trigger.getAttribute('aria-describedby'), 'workspace-menu-notification-count')
    assert.equal(await page.locator('#workspace-menu-notification-count').innerText(), '읽지 않은 알림: 6')
    await trigger.click()
    const menu = page.locator('[data-workspace-menu]')
    await menu.waitFor()
    assert.deepEqual(await menu.getByRole('group').evaluateAll(elements => elements.map(el => el.getAttribute('aria-label'))), ['사용자 및 계정', '알림', '도구', 'Mew'])
    assert.equal(await menu.locator('[data-menu-notice]').count(), 4)
    assert.equal(await menu.locator('[data-menu-notice]').first().innerText(), '에이전트에서 오류가 발생했어요\nAgent 1', 'urgent notices stay first')
    assert.equal(await menu.locator('img').count(), 0, 'broken profile images recover to initials')
    assert.equal(await menu.locator('.mew-workspace-menu-avatar').innerText(), 'AL')
    for (const row of await menu.locator('[data-header-menu-item]').all()) assert.equal((await row.boundingBox())!.height, width < 768 ? 36 : 32)
    for (const row of await menu.locator('[data-menu-notice]').all()) assert.ok((await row.boundingBox())!.height <= 40)
    const bounds = (await menu.boundingBox())!
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width)
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= (width < 768 ? 688 : 740))
    await page.screenshot({ path: `/tmp/mew-workspace-menu-${width}-${dark ? 'dark' : 'light'}.png` })
    await page.keyboard.press('End')
    assert.equal(await menu.getByRole('menuitem', { name: '설정', exact: true }).evaluate(el => el === el.ownerDocument.activeElement), true)
    await page.keyboard.press('Home')
    assert.equal(await menu.getByRole('menuitem', { name: '계정: Alex Kim', exact: true }).evaluate(el => el === el.ownerDocument.activeElement), true)
    await menu.getByRole('menuitem', { name: '전체 보기', exact: true }).click()
    await menu.waitFor({ state: 'detached' })
    const history = page.getByRole('dialog', { name: '알림', exact: true })
    await history.waitFor()
    assert.equal(await history.locator('li').count(), 6)
    await history.getByRole('button', { name: '닫기', exact: true }).click()
    assert.equal(await trigger.evaluate(el => el === el.ownerDocument.activeElement), true)
    await trigger.click()
    const dismiss = menu.getByRole('menuitem', { name: '알림 닫기: Agent 1', exact: true })
    await dismiss.focus(); await dismiss.press('Enter')
    await menu.locator('[data-menu-notice]').nth(1).getByRole('menuitem').first().evaluate(el => new Promise<void>(resolve => el.ownerDocument.defaultView!.requestAnimationFrame(() => resolve())))
    assert.equal(await menu.evaluate(el => el.contains(el.ownerDocument.activeElement)), true, 'keyboard acknowledgment retains menu focus')
    assert.equal(await menu.locator('[data-menu-notice]').count(), 4, 'dismissal reveals the next queued notification')
    assert.equal(await page.locator('[data-menu-notification-count]').innerText(), '5')
    await menu.locator('[data-menu-notice]').first().getByRole('menuitem').first().click()
    await menu.waitFor({ state: 'detached' })
    assert.deepEqual(await page.evaluate('window.actions'), ['Agent 5'])
    await page.evaluate('window.clearNotices()')
    assert.equal(await page.locator('[data-menu-notification-count]').count(), 0)
    await trigger.click()
    assert.equal(await menu.getByText('새 알림이 없습니다', { exact: true }).count(), 1)
    for (const [locale, group] of [['en', 'User & Account'], ['zh-CN', '用户与账户'], ['ja', 'ユーザーとアカウント']]) {
      await page.evaluate(`window.setLocale('${locale}')`)
      await menu.getByRole('group', { name: group, exact: true }).waitFor()
    }
    await page.keyboard.press('Escape')
    await menu.waitFor({ state: 'detached' })
    assert.deepEqual(errors, [])
    await page.close()
  }
})
