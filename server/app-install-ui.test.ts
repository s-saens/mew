import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium, type Browser, type Page } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')
const require = createRequire(`${root}/package.json`)
const installText = 'mew를 앱으로 설치하면 주소창 없이 바로 열 수 있어요.'
const installHidden = 'mew:startup-guide:install:hidden'
const fullscreenHidden = 'mew:startup-guide:fullscreen:hidden'

async function installGuideBundle() {
  const source = `
import React from '${require.resolve('react')}';
import {createRoot} from '${require.resolve('react-dom/client')}';
import {I18nProvider,useI18n} from '${root}/src/i18n.tsx';
async function bootstrap(){
const query=new URLSearchParams(location.search);
localStorage.setItem('mew:locale','ko');
Object.defineProperty(window,'isSecureContext',{value:true,configurable:true});
Object.defineProperty(navigator,'userAgent',{value:query.has('firefox')?'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0':query.has('desktop')?'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36':query.has('ios')?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1':'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36',configurable:true});
Object.defineProperty(navigator,'platform',{value:query.has('ios')?'iPhone':'Linux',configurable:true});
Object.defineProperty(navigator,'standalone',{value:query.has('iosStandalone'),configurable:true});
const matchMedia=window.matchMedia.bind(window);
const displayQueries=[];
window.matchMedia=media=>{
  const result=matchMedia(media);
  if(media.includes('display-mode:')){
    Object.defineProperty(result,'matches',{value:!!query.get('mode')&&media.includes(query.get('mode')),configurable:true});
    displayQueries.push(result);
  }
  return result;
};
window.setDisplayMode=mode=>{
  for(const media of displayQueries){
    Object.defineProperty(media,'matches',{value:!!mode&&media.media.includes(mode),configurable:true});
    media.dispatchEvent(new Event('change'));
  }
};
Object.defineProperty(document,'fullscreenEnabled',{value:true,configurable:true});
if(query.has('apiFullscreen'))Object.defineProperty(document,'fullscreenElement',{value:document.documentElement,configurable:true});
document.documentElement.requestFullscreen=async()=>{
  window.fullscreenRequests=(window.fullscreenRequests||0)+1;
  Object.defineProperty(document,'fullscreenElement',{value:document.documentElement,configurable:true});
  document.dispatchEvent(new Event('fullscreenchange'));
};
window.exitFullscreen=()=>{
  Object.defineProperty(document,'fullscreenElement',{value:null,configurable:true});
  window.setDisplayMode('');
  document.dispatchEvent(new Event('fullscreenchange'));
};
window.dispatchInstallPrompt=(outcome='dismissed',fail=false)=>{
  const event=new Event('beforeinstallprompt',{cancelable:true});
  event.prompt=async()=>{window.installPrompts=(window.installPrompts||0)+1;if(fail)throw new Error('install prompt unavailable');};
  event.userChoice=Promise.resolve({outcome,platform:'web'});
  window.dispatchEvent(event);
  window.installPromptPrevented=event.defaultPrevented;
};
const {startAppInstallTracking}=await import('${root}/src/utils/app-install.ts');
const {Mewcat}=await import('${root}/src/components/Mewcat.tsx');
startAppInstallTracking();
if(query.has('native'))window.dispatchInstallPrompt(query.get('choice')||'dismissed',query.has('fail'));
function Fixture(){window.setLocale=useI18n().setLocale;return <><main id="fixture-ready"/><Mewcat skin={null}/></>}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);
}
void bootstrap();`
  const bundle = await build({ input: 'virtual:app-install.tsx', write: false, platform: 'browser', onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) }, output: { format: 'iife', codeSplitting: false }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{ name: 'fixture', resolveId(id) { if (id === 'virtual:app-install.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' }, load(id) { if (id === 'virtual:app-install.tsx') return source; if (id === 'virtual:style') return '' } }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')
  assert.ok(chunk && chunk.type === 'chunk')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const guides = (await fs.readdir(`${root}/src/components`)).filter(file => file.startsWith('mewcat-') && file.includes('guide') && file.endsWith('.tsx'))
  const markup = (await Promise.all(guides.map(file => fs.readFile(`${root}/src/components/${file}`, 'utf8')))).join('\n')
  const css = compiler.build(markup.match(/[A-Za-z0-9_:[\]/.%!#()-]+/g) ?? [])
  return `<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script>${chunk.code}</script></html>`
}

async function fixturePage(browser: Browser, html: string, query = '') {
  const context = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: !query.includes('desktop') })
  const page = await context.newPage()
  page.setDefaultTimeout(4_000)
  await page.route('http://install.test/**', route => route.fulfill({ contentType: 'text/html', body: html }))
  await page.route('**/api/mewpet/skins**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ skins: [], canManage: false }) }))
  await page.goto(`http://install.test/${query}`)
  await settle(page)
  return { page, close: () => context.close() }
}

async function settle(page: Page) {
  await page.locator('#fixture-ready').evaluate(el => new Promise<void>(resolve => {
    const view = el.ownerDocument.defaultView!
    view.requestAnimationFrame(() => view.requestAnimationFrame(() => resolve()))
  }))
}

test('app installation and fullscreen startup guidance follows platform, installation, and saved choices', { skip: !domBrowserExecutable(), timeout: 90_000 }, async t => {
  const html = await installGuideBundle()
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    await t.test('mobile installation comes first without a pet and both opt-outs persist independently', async () => {
      const { page, close } = await fixturePage(browser, html)
      try {
        const guide = page.locator('aside.mewcat-notifications')
        const install = guide.getByText(installText, { exact: true })
        const hidden = guide.getByRole('checkbox', { name: '다시 보지 않기', exact: true })
        const fullscreen = guide.getByRole('button', { name: /전체화면으로 전환/ })
        await install.waitFor()
        await guide.getByText(/브라우저 메뉴에서.*‘홈 화면에 추가’/).waitFor()
        assert.equal(await page.locator('.mewcat').count(), 0)
        assert.equal(await guide.getByRole('button', { name: '앱 설치', exact: true }).count(), 0, 'manual guidance must not expose an unavailable native prompt')
        assert.equal(await fullscreen.count(), 0)
        const bounds = await guide.boundingBox()
        assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 390 && bounds.y + bounds.height <= 780)
        assert.equal(await guide.evaluate(el => el.scrollWidth <= el.clientWidth), true)
        await page.screenshot({ path: '/tmp/mew-app-install-guide-android.png' })
        await guide.getByRole('button', { name: '알림 닫기', exact: true }).click()
        await fullscreen.waitFor()
        await page.reload()
        await install.waitFor()
        assert.equal(await hidden.isChecked(), false, 'closing alone does not opt out')
        await hidden.check()
        assert.equal(await page.evaluate(`localStorage.getItem('${installHidden}')`), '1')
        await hidden.uncheck()
        assert.equal(await page.evaluate(`localStorage.getItem('${installHidden}')`), '0')
        await hidden.check()
        await guide.getByRole('button', { name: '알림 닫기', exact: true }).click()
        await fullscreen.waitFor()
        assert.equal(await hidden.isChecked(), false, 'installation opt-out does not select fullscreen opt-out')
        await page.reload()
        await fullscreen.waitFor()
        assert.equal(await install.count(), 0)
        await hidden.check()
        assert.equal(await page.evaluate(`localStorage.getItem('${fullscreenHidden}')`), '1')
        await hidden.uncheck()
        assert.equal(await page.evaluate(`localStorage.getItem('${fullscreenHidden}')`), '0')
        await hidden.check()
        await page.reload()
        await settle(page)
        assert.equal(await guide.count(), 0)
        await page.evaluate(`localStorage.setItem('${installHidden}','0')`)
        await page.reload()
        await install.waitFor()
        await guide.getByRole('button', { name: '알림 닫기', exact: true }).click()
        await settle(page)
        assert.equal(await guide.count(), 0, 'fullscreen opt-out remains independent when installation guidance is restored')
      } finally { await close() }
    })

    await t.test('iOS gets home screen instructions and changing locale updates all guide controls', async () => {
      const { page, close } = await fixturePage(browser, html, '?ios=1')
      try {
        const guide = page.locator('aside.mewcat-notifications')
        await guide.getByText('공유 메뉴에서 ‘홈 화면에 추가’를 선택해 주세요.', { exact: true }).waitFor()
        await page.screenshot({ path: '/tmp/mew-app-install-guide-ios.png' })
        assert.equal(await guide.getByRole('button', { name: '앱 설치', exact: true }).count(), 0)
        await page.evaluate("window.setLocale('en')")
        await guide.getByRole('checkbox', { name: /don[’']t show again/i }).waitFor()
        assert.equal(await guide.getByText(installText, { exact: true }).count(), 0)
        await guide.getByRole('button', { name: /dismiss/i }).click()
        await guide.getByText('Use full screen so mew shortcuts work reliably.', { exact: true }).waitFor()
        await guide.getByRole('checkbox', { name: /don[’']t show again/i }).waitFor()
      } finally { await close() }
    })

    await t.test('supported desktop starts with manual installation guidance and adds its native action when ready', async () => {
      const { page, close } = await fixturePage(browser, html, '?desktop=1')
      try {
        const guide = page.locator('aside.mewcat-notifications')
        await guide.getByText(installText, { exact: true }).waitFor()
        await guide.getByText(/브라우저 메뉴에서.*‘홈 화면에 추가’/).waitFor()
        assert.equal(await guide.getByRole('button', { name: '앱 설치', exact: true }).count(), 0)
        assert.equal(await guide.getByRole('button', { name: /전체화면으로 전환/ }).count(), 0)
        await page.evaluate('window.dispatchInstallPrompt()')
        await guide.getByRole('button', { name: '앱 설치', exact: true }).waitFor()
        assert.equal(await page.evaluate('window.installPromptPrevented'), true)
        assert.equal(await guide.getByRole('button', { name: /전체화면으로 전환/ }).count(), 0)
      } finally { await close() }
    })

    await t.test('unsupported desktop prefers fullscreen until an install event establishes support', async () => {
      const { page, close } = await fixturePage(browser, html, '?desktop=1&firefox=1')
      try {
        const guide = page.locator('aside.mewcat-notifications')
        await guide.getByRole('button', { name: /전체화면으로 전환/ }).waitFor()
        assert.equal(await guide.getByText(installText, { exact: true }).count(), 0)
        await page.evaluate('window.dispatchInstallPrompt()')
        await guide.getByRole('button', { name: '앱 설치', exact: true }).waitFor()
        assert.equal(await guide.getByRole('button', { name: /전체화면으로 전환/ }).count(), 0)
      } finally { await close() }
    })

    for (const choice of ['accepted', 'dismissed', 'error']) {
      await t.test(`native installation ${choice} keeps startup guidance consistent`, async () => {
        const { page, close } = await fixturePage(browser, html, `?native=1&choice=${choice === 'accepted' ? 'accepted' : 'dismissed'}${choice === 'error' ? '&fail=1' : ''}`)
        try {
          const guide = page.locator('aside.mewcat-notifications')
          await guide.getByRole('button', { name: '앱 설치', exact: true }).click()
          await settle(page)
          assert.equal(await page.evaluate('window.installPrompts'), 1)
          assert.equal(await page.evaluate('window.fullscreenRequests||0'), 0)
          if (choice === 'accepted') {
            assert.equal(await guide.count(), 0, 'accepting installation suppresses the follow-up fullscreen suggestion')
          } else {
            await guide.getByText(installText, { exact: true }).waitFor()
            await guide.getByText(/브라우저 메뉴에서.*‘홈 화면에 추가’/).waitFor()
            assert.equal(await guide.getByRole('button', { name: '앱 설치', exact: true }).count(), 0, 'the consumed browser event cannot be prompted twice')
            if (choice === 'error') await guide.getByRole('alert').waitFor()
            assert.equal(await guide.getByRole('button', { name: /전체화면으로 전환/ }).count(), 0)
            await page.evaluate('window.dispatchInstallPrompt()')
            await guide.getByRole('button', { name: '앱 설치', exact: true }).click()
            await settle(page)
            assert.equal(await page.evaluate('window.installPrompts'), 2, 'a fresh native event enables another attempt')
          }
        } finally { await close() }
      })
    }

    await t.test('appinstalled removes both suggestions', async () => {
      const { page, close } = await fixturePage(browser, html, '?native=1')
      try {
        const guide = page.locator('aside.mewcat-notifications')
        await guide.getByText(installText, { exact: true }).waitFor()
        await page.evaluate("window.dispatchEvent(new Event('appinstalled'))")
        await guide.waitFor({ state: 'detached' })
        await page.evaluate("window.setDisplayMode('standalone');window.setDisplayMode('')")
        await settle(page)
        assert.equal(await guide.count(), 0, 'display mode changes must not undo a completed installation')
        assert.equal(await page.evaluate('window.fullscreenRequests||0'), 0)
      } finally { await close() }
    })

    await t.test('Fullscreen API launch can return to ordinary browser installation guidance', async () => {
      const { page, close } = await fixturePage(browser, html, '?mode=fullscreen&apiFullscreen=1')
      try {
        const guide = page.locator('aside.mewcat-notifications')
        assert.equal(await guide.count(), 0)
        await page.evaluate('window.exitFullscreen()')
        await guide.getByText(installText, { exact: true }).waitFor()
      } finally { await close() }
    })

    for (const query of ['?mode=standalone', '?mode=fullscreen', '?mode=minimal-ui', '?ios=1&iosStandalone=1']) {
      await t.test(`${query} starts without either suggestion`, async () => {
        const { page, close } = await fixturePage(browser, html, query)
        try { assert.equal(await page.locator('aside.mewcat-notifications').count(), 0) }
        finally { await close() }
      })
    }
  } finally { await browser.close() }
})
