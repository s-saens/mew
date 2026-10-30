import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

test('remote public shares hand off the validated public path and device base into the installed app', { skip: !domBrowserExecutable(), timeout: 20_000 }, async t => {
  const bundle = await build({ input: 'virtual:share.ts', write: false, platform: 'browser', output: { format: 'iife' }, plugins: [{ name: 'fixture', resolveId(id) { if (id === 'virtual:share.ts') return id }, load(id) { if (id === 'virtual:share.ts') return `import {initializeRemoteApp} from '${new URL('../src/utils/remote-app.ts', import.meta.url).pathname}';import {publicShareUrl} from '${new URL('../src/utils/public-share-url.ts', import.meta.url).pathname}';initializeRemoteApp().then(auth=>parent.postMessage({type:'fixture-result',auth,search:location.search,url:publicShareUrl('f','a'.repeat(43))},location.origin)).catch(error=>parent.postMessage({type:'fixture-error',message:error.message},location.origin));` } }] })
  const code = bundle.output.find(item => item.type === 'chunk')!.code
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const token = 'a'.repeat(43), address = 'https://share-frame.test'
  await page.route(address + '/**', route => {
    if (new URL(route.request().url()).pathname.startsWith('/__mew_ui/')) return route.fulfill({ contentType: 'text/html', body: `<script>${code}</script>` })
    const valid = new URL(route.request().url()).pathname !== '/invalid'
    return route.fulfill({ contentType: 'text/html', body: `<iframe src="/__mew_ui/fixture_abcdefghijklmnop/index.html"></iframe><script>window.addEventListener('message',event=>{if(event.data?.type==='fixture-result')window.fixtureResult=event.data;if(event.data?.type==='fixture-error')window.fixtureError=event.data.message;if(event.data?.type==='mew-app-ready')event.ports[0].postMessage({type:'mew-app-context',instance:'fixture-instance',previewBaseUrl:'https://mew.run/public-owner/home',sharePath:${JSON.stringify(valid ? `/share/d/${token}` : '/share/d/invalid')},initialAuth:{authenticated:false,email:null,role:'guest',mustChangePassword:false}})})</script>` })
  })
  await page.goto(address)
  await page.waitForFunction('window.fixtureResult || window.fixtureError')
  const result = await page.evaluate('window.fixtureResult') as { auth: { authenticated: boolean }; search: string; url: string }
  assert.equal(result.auth.authenticated, false)
  assert.equal(new URLSearchParams(result.search).get('sharePath'), `/share/d/${token}`)
  assert.equal(result.url, `https://mew.run/public-owner/home/share/f/${token}`)
  await page.goto(address + '/invalid')
  await page.waitForFunction('window.fixtureResult || window.fixtureError')
  assert.equal(new URLSearchParams((await page.evaluate('window.fixtureResult.search')) as string).has('sharePath'), false)
  assert.deepEqual(errors, [])
})
