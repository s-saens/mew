import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import express from 'express'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'
import { WebSocketServer } from 'ws'

test('account UI opens the shared native browser panel and refreshes without sending a prompt', { skip: !domBrowserExecutable(), timeout: 45_000 }, async (t) => {
  const app = express()
  app.use(express.json())
  let closed = false
  app.post('/api/login-desktop', (req, res) => res.json({ id: 'fixture', job: 'fixture', url: req.body.url, streamUrl: '/api/browser-desktop/ws?login=fixture' }))
  app.delete('/api/login-desktop/fixture', (_req, res) => { closed = true; res.json({ ok: true }) })
  const requests: string[] = []
  let origin = '', reads = 0
  app.get('/api/agent-runtimes/kimi/account', (_req, res) => {
    reads++
    res.json({ account: { runtime: 'kimi', account: 'long-account-name-for-mobile-layout@example.test', plan: reads > 1 ? 'pro' : 'free', authentication: 'connected', subscription: reads > 1 ? 'paid' : 'free', issue: reads > 1 ? null : 'quota_exhausted', subscriptionUrl: `${origin}/billing`, checkedAt: new Date().toISOString(), note: null } })
  })
  app.get('/billing', (_req, res) => res.type('html').send('<html><body><h1>Subscription fixture</h1><button onclick="document.querySelector(\'h1\').textContent=\'Plan selected\'">Choose plan</button></body></html>'))
  const bundle = await build({
    input: 'virtual:account', output: { format: 'esm' }, platform: 'browser', write: false, logLevel: 'silent',
    transform: { define: { 'process.env.NODE_ENV': JSON.stringify('test') }, jsx: 'react-jsx' },
    plugins: [{ name: 'account-fixture', resolveId(id) { if (id === 'virtual:account') return id; if (id.endsWith('.css')) return 'virtual:style' }, load(id) {
      if (id === 'virtual:style') return ''
      if (id === 'virtual:account') return `import React from ${JSON.stringify(import.meta.resolve('react'))};
import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
import {I18nProvider} from ${JSON.stringify(new URL('../src/i18n.tsx', import.meta.url).pathname)};
import {AgentAccountCard} from ${JSON.stringify(new URL('../src/components/AgentAccountCard.tsx', import.meta.url).pathname)};
createRoot(document.getElementById('root')).render(React.createElement(I18nProvider,null,React.createElement(AgentAccountCard,{runtime:'kimi'})));`
    } }],
  })
  const code = bundle.output.find((item) => item.type === 'chunk')!
  app.get('/app.js', (_req, res) => res.type('js').send(code.type === 'chunk' ? code.code : ''))
  // Use the existing app stylesheet for the optional local visual inspection.
  let css = ''
  const assets = new URL('../dist/assets/', import.meta.url)
  try { const file = (await fs.readdir(assets)).find((name) => name.endsWith('.css')); if (file) css = await fs.readFile(new URL(file, assets), 'utf8') } catch { /* behavioral test needs no production build */ }
  app.get('/style.css', (_req, res) => res.type('css').send(css))
  app.get('/', (_req, res) => res.type('html').send('<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'))
  const server = http.createServer(app)
  const video = new WebSocketServer({ server, path: '/api/browser-desktop/ws' }), signals: Array<{ type: string }> = []
  video.on('connection', socket => socket.on('message', raw => {
    const value = JSON.parse(raw.toString()) as { type: string }
    signals.push(value)
    if (value.type === 'open') socket.send(JSON.stringify({ type: 'offer', negotiation: 0, sdp: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 102\r\na=rtpmap:102 H264/90000\r\n' }))
  }))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(async () => {
    await browser.close(); video.close()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (req) => { if (req.method() === 'POST') requests.push(req.url()) })
  await page.addInitScript(() => localStorage.setItem('mew:locale', 'ko'))
  await page.addInitScript(`window.RTCPeerConnection=class {
    connectionState='new';remoteDescription=null;localDescription=null;receivers=[];
    async setRemoteDescription(value){this.remoteDescription=value;for(const label of ['control','motion'])this.ondatachannel?.({channel:{label,readyState:'open',bufferedAmount:0,send(){},close(){}}});const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const context=canvas.getContext('2d');context.fillStyle='#123456';context.fillRect(0,0,640,480);const stream=canvas.captureStream(30);this.receivers=[{track:stream.getVideoTracks()[0]}];this.ontrack?.({streams:[stream],track:stream.getVideoTracks()[0],receiver:{jitterBufferTarget:50}});window.accountVideoTimer=setInterval(()=>context.fillRect(0,0,640,480),30)}
    async addIceCandidate(){}async createAnswer(){return {type:'answer',sdp:'v=0\\r\\na=rtpmap:102 H264/90000\\r\\n'}}async setLocalDescription(value){this.localDescription=value}async getStats(){return new Map()}getReceivers(){return this.receivers}close(){this.connectionState='closed';clearInterval(window.accountVideoTimer)}
  }`)
  await page.goto(origin)
  await page.getByText('long-account-name-for-mobile-layout@example.test', { exact: true }).waitFor()
  assert.equal(await page.getByText('사용량 한도를 모두 사용했습니다', { exact: true }).isVisible(), true)
  assert.equal(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
  if (process.env.MEW_ACCOUNT_UI_SCREENSHOTS === '1') {
    await page.screenshot({ path: path.join(os.tmpdir(), 'mew-account-mobile.png') })
    await page.setViewportSize({ width: 1100, height: 800 })
    await page.screenshot({ path: path.join(os.tmpdir(), 'mew-account-desktop.png') })
    await page.setViewportSize({ width: 390, height: 844 })
  }
  await page.getByRole('button', { name: '구독하기', exact: true }).click()
  await page.locator('[data-browser-desktop-panel][data-embedded] [data-login-desktop] video').waitFor()
  await page.waitForFunction('document.querySelector("[data-login-desktop] video").videoWidth===640')
  assert.equal(await page.locator('[data-login-desktop] img, [data-login-desktop] iframe').count(), 0, 'subscription login uses the same WebRTC video panel')
  assert.equal(signals.some(value => value.type === 'answer'), true)
  assert.equal(signals.some(value => value.type === 'frame-ack'), false)
  assert.equal(page.context().pages().length, 1, 'no external browser tab')
  await page.getByRole('button', { name: '채팅으로 돌아가기' }).click()
  await page.getByText('플랜: pro · 구독 중', { exact: true }).waitFor({ state: 'attached' })
  assert.equal(reads, 2)
  await page.waitForTimeout(100)
  assert.equal(closed, true)
  assert.equal(requests.every((url) => url === `${origin}/api/login-desktop`), true, 'only the sign-in video session was opened; no payment/prompt request')
  assert.deepEqual(errors, [])
})
