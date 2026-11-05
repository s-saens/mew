import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import { build } from 'rolldown'

const data = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-browser-panel-integration-'))
process.env.MEW_DATA_DIR = data
process.env.MEW_DESKTOP_ICE_SERVERS = '[]'
process.env.MEW_DESKTOP_AUTO_NAT = '0'
const { attachBrowserDesktopWebSocket, closeBrowserDesktops } = await import('./browser-desktop.ts')
const { domBrowserExecutable, externalBrowserExecutable } = await import('./browser-dom-executable.ts')
const { connectTestBrowser } = await import('./test-browser.ts')
const native = createRequire(new URL('../native/remote-desktop/package.json', import.meta.url))
let supported = process.platform === 'linux' && !!domBrowserExecutable() && !!externalBrowserExecutable()
try { native.resolve('node-datachannel') } catch { supported = false }
supported &&= ['Xvfb', 'ffmpeg', 'python3'].every(command => spawnSync(command, [command === 'ffmpeg' ? '-version' : command === 'Xvfb' ? '-help' : '--version'], { stdio: 'ignore' }).status === 0)
test.after(async () => { await closeBrowserDesktops(); await fs.rm(data, { recursive: true, force: true }) })

test('production browser panel receives native Chrome video and sends clicks through real WebRTC', { skip: !supported, timeout: 60_000 }, async t => {
  const events: Array<Record<string, string>> = [], errors: string[] = []
  const fixture = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === '/event') { events.push(Object.fromEntries(url.searchParams)); res.end('ok'); return }
    res.setHeader('Content-Type', 'text/html')
    res.end(`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#154734}button{position:absolute;left:30px;top:30px;width:240px;height:60px}</style><button onclick="document.body.style.background='#1446dc';fetch('/event?kind=click&trusted='+event.isTrusted+'&document='+window.fixtureDocument)">Native button</button><script>window.fixtureDocument=crypto.randomUUID();fetch('/event?kind=loaded&height='+innerHeight+'&webdriver='+navigator.webdriver+'&document='+window.fixtureDocument);addEventListener('resize',()=>fetch('/event?kind=resize&height='+innerHeight+'&document='+window.fixtureDocument))</script>`)
  })
  const scripts = new Map<string, string>()
  let entryName = ''
  const viewer = createServer((req, res) => {
    const script = scripts.get(new URL(req.url ?? '/', 'http://localhost').pathname)
    if (script !== undefined) { res.setHeader('Content-Type', 'text/javascript'); res.end(script); return }
    res.setHeader('Content-Type', 'text/html')
    res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0}*{box-sizing:border-box}.flex{display:flex}.flex-col{flex-direction:column}.flex-1{flex:1}.h-full{height:100%}.w-full{width:100%}.min-h-0{min-height:0}.shrink-0{flex-shrink:0}.relative{position:relative}.absolute{position:absolute}.inset-0{inset:0}.object-contain{object-fit:contain}header{height:32px;gap:4px}header button{width:28px;height:28px}video{pointer-events:none;width:100%;height:100%}textarea{position:absolute;left:0;bottom:0;width:1px;height:1px;opacity:0}[data-browser-desktop]{background:black;overflow:hidden;touch-action:none}span.flex-1{flex:1}</style><div id="root"></div><script type="module" src="/${entryName}"></script>`)
  })
  attachBrowserDesktopWebSocket(viewer, () => ({ email: 'native-panel@test', role: 'owner', mustChangePassword: false }))
  const closeServer = async (server: Server) => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
  let browser: Awaited<ReturnType<typeof connectTestBrowser>> | undefined
  try {
    fixture.listen(0, '127.0.0.1'); viewer.listen(0, '127.0.0.1')
    await Promise.all([once(fixture, 'listening'), once(viewer, 'listening')])
    const target = `http://127.0.0.1:${(fixture.address() as { port: number }).port}/fixture`
    const origin = `http://127.0.0.1:${(viewer.address() as { port: number }).port}`
    const bundle = await build({ input: 'virtual:native-panel.tsx', logLevel: 'silent', write: false, platform: 'browser', output: { format: 'esm' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production') } }, plugins: [{
      name: 'real-browser-panel-fixture',
      resolveId(id) {
        if (id.startsWith('virtual:')) return id
        if (id.endsWith('/remote-transport')) return 'virtual:transport'
        if (id.endsWith('/DockWorkspace')) return 'virtual:dock.tsx'
        if (id.endsWith('.css')) return 'virtual:style'
      },
      load(id) {
        if (id === 'virtual:style') return ''
        if (id === 'virtual:dock.tsx') return 'export function DockGrip(){return <span/>}'
        if (id === 'virtual:transport') return 'export function openMewSocket(url){const socket=new WebSocket(url),send=socket.send.bind(socket);socket.send=value=>{(window.signalTrace??=[]).push(JSON.parse(value));send(value)};return socket};export function mewFetch(url,options){return fetch(url,options)}'
        if (id === 'virtual:native-panel.tsx') return `import React from ${JSON.stringify(import.meta.resolve('react'))};import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};import {setUiLocale} from ${JSON.stringify(import.meta.resolve('@mew/ui/i18n-core'))};import {BrowserDesktopPanel} from ${JSON.stringify(new URL('../src/components/BrowserDesktopPanel.tsx', import.meta.url).pathname)};setUiLocale('en');function Fixture(){const [open,setOpen]=React.useState(true);return <div style={{height:'100vh',width:'100vw'}}>{open&&<BrowserDesktopPanel url={${JSON.stringify(target)}} nativeAllowed onClose={()=>setOpen(false)}/>}</div>}createRoot(document.getElementById('root')).render(<Fixture/>);`
      },
    }] })
    for (const chunk of bundle.output) if (chunk.type === 'chunk') { scripts.set(`/${chunk.fileName}`, chunk.code); if (chunk.isEntry) entryName = chunk.fileName }
    browser = await connectTestBrowser()
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
    page.on('pageerror', error => errors.push(error.message))
    page.setDefaultTimeout(5000)
    await page.goto(origin)
    await page.waitForFunction('!!document.querySelector("[role=alert]")||document.querySelector("video")?.videoWidth>0', null, { timeout: 25_000 })
    assert.equal(await page.locator('[role=alert]').count(), 0, await page.locator('body').innerText())
    await page.waitForFunction('document.querySelector("video").getVideoPlaybackQuality().totalVideoFrames>3', null, { timeout: 15_000 })
    for (let index = 0; index < 100 && !events.some(value => value.kind === 'loaded'); index++) await delay(25)
    const loaded = events.find(value => value.kind === 'loaded')
    assert.ok(loaded, 'the separate headed Chrome loaded the target fixture')
    assert.equal(loaded.webdriver, 'false')
    const size = await page.evaluate<{ width: number; height: number }>('({width:document.querySelector("video").videoWidth,height:document.querySelector("video").videoHeight})')
    const bounds = (await page.locator('[data-browser-desktop]').boundingBox())!
    assert.ok(Number(loaded.height) < size.height, 'the video includes Chrome’s native toolbar')
    const scale = Math.min(bounds.width / size.width, bounds.height / size.height)
    const x = bounds.x + (bounds.width - size.width * scale) / 2 + 100 * scale
    const y = bounds.y + (bounds.height - size.height * scale) / 2 + (size.height - Number(loaded.height) + 60) * scale
    await page.mouse.click(x, y)
    for (let index = 0; index < 200 && !events.some(value => value.kind === 'click'); index++) await delay(25)
    assert.equal(events.find(value => value.kind === 'click')?.trusted, 'true', 'a real viewer click reaches native Chrome through its control data channel')
    await page.waitForFunction(`(()=>{const video=document.querySelector('video'),canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d');context.drawImage(video,video.videoWidth-30,video.videoHeight-30,1,1,0,0,1,1);const pixel=context.getImageData(0,0,1,1).data;return pixel[2]>140&&pixel[0]<80&&pixel[1]<130})()`, null, { timeout: 5000 })
    const beforeReconnect = events.filter(value => value.kind === 'click').length
    await page.getByRole('button', { name: 'Reconnect', exact: true }).first().click()
    await page.waitForFunction(`document.querySelector('button[aria-label="Keyboard input"]').disabled`)
    await page.waitForFunction(`!document.querySelector('button[aria-label="Keyboard input"]').disabled`, null, { timeout: 20_000 })
    await page.mouse.click(x, y)
    for (let index = 0; index < 200 && events.filter(value => value.kind === 'click').length === beforeReconnect; index++) await delay(25)
    assert.equal(events.filter(value => value.kind === 'loaded').length, 1, `healthy Reconnect preserves the existing Chrome document: ${JSON.stringify(events)} ${await page.evaluate('JSON.stringify(window.signalTrace.map(value=>({type:value.type,url:value.url})))')}`)
    assert.equal(events.filter(value => value.kind === 'click').length, beforeReconnect + 1, 'the retained native page stays interactive after reconnect')
    assert.equal(events.findLast(value => value.kind === 'click')?.document, loaded.document)
    await page.setViewportSize({ width: 390, height: 700 })
    await page.waitForFunction('document.querySelector("video").videoWidth===390', null, { timeout: 15_000 })
    for (let index = 0; index < 100 && !events.some(value => value.kind === 'resize'); index++) await delay(25)
    const resized = events.findLast(value => value.kind === 'resize')
    assert.ok(resized)
    const mobileSize = await page.evaluate<{ width: number; height: number }>('({width:document.querySelector("video").videoWidth,height:document.querySelector("video").videoHeight})')
    const mobileBounds = (await page.locator('[data-browser-desktop]').boundingBox())!
    const mobileScale = Math.min(mobileBounds.width / mobileSize.width, mobileBounds.height / mobileSize.height)
    const mobileX = mobileBounds.x + (mobileBounds.width - mobileSize.width * mobileScale) / 2 + 100 * mobileScale
    const mobileY = mobileBounds.y + (mobileBounds.height - mobileSize.height * mobileScale) / 2 + (mobileSize.height - Number(resized.height) + 60) * mobileScale
    const beforeMobileClick = events.filter(value => value.kind === 'click').length
    await page.mouse.click(mobileX, mobileY)
    for (let index = 0; index < 200 && events.filter(value => value.kind === 'click').length === beforeMobileClick; index++) await delay(25)
    assert.equal(events.filter(value => value.kind === 'click').length, beforeMobileClick + 1, 'native Chrome stays interactive in a 390px viewer')
    assert.equal(events.findLast(value => value.kind === 'click')?.document, loaded.document)
    assert.equal(await page.locator('img,iframe').count(), 0, 'the production panel displays video without a DOM or image relay')
    assert.deepEqual(errors, [])
    t.diagnostic(JSON.stringify({ video: size, trustedNativeClicks: events.filter(value => value.kind === 'click').length }))
    await page.getByRole('button', { name: 'Close browser', exact: true }).click()
    await page.locator('video').waitFor({ state: 'detached' })
  } finally {
    await closeBrowserDesktops(); await browser?.close()
    await Promise.all([closeServer(viewer), closeServer(fixture)])
    const rtc = native('node-datachannel') as { cleanup: () => void }
    rtc.cleanup()
  }
})
