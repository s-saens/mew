import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')
const owner = 'owner@example.com'
const peer = 'peer@example.com'

test('member chat bubbles follow authorship, fit mobile themes, and retain conversation actions', { timeout: 60_000 }, async () => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {ChatPanel} from '${root}/src/components/ChatPanel.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
localStorage.setItem('mew:locale','ko');
createRoot(document.getElementById('root')).render(<I18nProvider><div style={{height:'100dvh'}}><ChatPanel authEmail="${owner}" authDisplayName="Owner" project="test" tree={[]} onOpenFile={(project,path)=>{document.getElementById('opened').textContent=project+':'+path}} onClose={()=>{}}/></div></I18nProvider>);`
  const bundle = await build({ onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) }, input: 'virtual:chat.tsx', write: false, platform: 'browser', output: { format: 'iife' }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{ name: 'fixture', resolveId(id) { if (id === 'virtual:chat.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' }, load(id) { if (id === 'virtual:chat.tsx') return source; if (id === 'virtual:style') return '' } }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const content = (await Promise.all(['src/components/ChatPanel.tsx', 'src/components/MentionTextarea.tsx', 'src/components/panel-close-button.tsx'].map(file => fs.readFile(`${root}/${file}`, 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@:/.[\]()%,-]+/g))])
  const initial = [
    { id: 'own-first', author: owner, time: 1_000, text: '내 첫 메시지', unread: 2 },
    { id: 'own-grouped', author: owner, time: 2_000, text: '내 연속 메시지', unread: 0 },
    { id: 'own-later', author: owner, time: 302_000, text: '시간이 지난 내 메시지', unread: 0 },
    { id: 'peer-first', author: peer, time: 363_000, text: '다른 사람의 메시지', unread: 3 },
    { id: 'peer-grouped', author: peer, time: 364_000, text: '다른 사람의 연속 메시지', unread: 0 },
    { id: 'another-peer', author: 'other@example.com', time: 365_000, text: '또 다른 사람의 메시지', unread: 0 },
    { id: 'long', author: peer, time: 366_000, text: 'https://example.com/' + 'verylongunbrokentext'.repeat(35), unread: 0 },
    { id: 'file', author: owner, time: 367_000, text: '파일 확인 [[test:docs/design.md]]', unread: 0 },
    { id: 'dm', author: peer, to: [owner], time: 368_000, text: '개인 대화 메시지', unread: 0 },
  ]
  const messages = [...initial]
  const sent: Array<{ text: string; to?: string[] }> = []
  const browser = await connectTestBrowser()
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(5_000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    let dark = false
    await page.route('http://mew-chat-bubbles.test/**', async route => {
      const request = route.request()
      const pathname = new URL(request.url()).pathname
      if (pathname === '/app.js') { await route.fulfill({ contentType: 'text/javascript', body: chunk.code }); return }
      if (pathname === '/api/member-profiles') {
        await route.fulfill({ json: { members: [{ email: owner, displayName: 'Owner', avatarDataUrl: null }, { email: peer, displayName: 'Peer', avatarDataUrl: null }, { email: 'other@example.com', displayName: 'Other', avatarDataUrl: null }] } }); return
      }
      if (pathname === '/api/chat' && request.method() === 'POST') {
        const body = request.postDataJSON() as { text: string; to?: string[] }
        sent.push(body)
        const message = { id: `sent-${sent.length}`, author: owner, time: 369_000 + sent.length, unread: 0, ...body }
        messages.push(message)
        await route.fulfill({ json: message }); return
      }
      if (pathname.startsWith('/api/')) { await route.fulfill({ json: { messages, unread: {}, dmSupported: true, canDeleteHistory: false } }); return }
      await route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="ko"${dark ? ' class="dark"' : ''}><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><output id="opened" hidden></output><script src="/app.js"></script></html>` })
    })
    const colors = new Map<string, string>()
    for (const width of [1100, 390]) {
      for (dark of [false, true]) {
        await page.setViewportSize({ width, height: 850 })
        await page.goto('http://mew-chat-bubbles.test/')
        await page.getByText('내 첫 메시지', { exact: true }).waitFor()
        const rows = page.locator('[data-chat-message]')
        assert.equal(await rows.count(), 8)
        assert.equal(await page.getByText('개인 대화 메시지', { exact: true }).count(), 0)
        assert.deepEqual(await rows.evaluateAll(elements => elements.map(el => ({ direction: el.getAttribute('data-chat-message'), header: !!el.querySelector('[data-chat-message-header]') }))), [
          { direction: 'outgoing', header: true }, { direction: 'outgoing', header: false }, { direction: 'outgoing', header: true },
          { direction: 'incoming', header: true }, { direction: 'incoming', header: false }, { direction: 'incoming', header: true },
          { direction: 'incoming', header: true }, { direction: 'outgoing', header: true },
        ])
        for (let index = 0; index < 8; index++) {
          const row = rows.nth(index)
          const bubble = row.locator('[data-chat-bubble]')
          const rowBox = (await row.boundingBox())!
          const bubbleBox = (await bubble.boundingBox())!
          const outgoing = await row.getAttribute('data-chat-message') === 'outgoing'
          assert.ok(bubbleBox.width <= rowBox.width * 0.85 + 1, 'bubble stays within its responsive width cap')
          assert.ok(Math.abs(outgoing ? bubbleBox.x + bubbleBox.width - rowBox.x - rowBox.width : bubbleBox.x - rowBox.x) <= 1, 'bubble aligns with its author side')
          assert.ok(bubbleBox.x >= 0 && bubbleBox.x + bubbleBox.width <= width, 'bubble stays inside viewport')
          const style = await bubble.evaluate(el => {
            const computed = el.ownerDocument.defaultView!.getComputedStyle(el)
            return { background: computed.backgroundColor, left: parseFloat(computed.borderTopLeftRadius), right: parseFloat(computed.borderTopRightRadius), overflow: el.scrollWidth > el.clientWidth + 1 }
          })
          assert.notEqual(style.background, 'rgba(0, 0, 0, 0)')
          assert.ok(outgoing ? style.left > style.right : style.right > style.left, 'bubble corner indicates authorship')
          assert.equal(style.overflow, false, 'long text and file references wrap inside bubble')
          colors.set(`${dark}:${outgoing}`, style.background)
        }
        for (const [index, count] of [[0, 2], [3, 3]]) {
          const row = rows.nth(index)
          const unread = row.getByTitle(`${count}명이 아직 안 읽음`)
          const bubble = row.locator('[data-chat-bubble]')
          assert.equal(await bubble.getByTitle(`${count}명이 아직 안 읽음`).count(), 0)
          const unreadBox = (await unread.boundingBox())!
          const bubbleBox = (await bubble.boundingBox())!
          assert.ok(index === 0 ? unreadBox.x + unreadBox.width <= bubbleBox.x : unreadBox.x >= bubbleBox.x + bubbleBox.width, 'unread count sits outside the bubble toward the center')
        }
        assert.equal(await page.locator('body').evaluate(el => el.ownerDocument.documentElement.scrollWidth > el.ownerDocument.documentElement.clientWidth), false)
        await rows.first().scrollIntoViewIfNeeded()
        await page.screenshot({ path: `/tmp/mew-chat-bubbles-${width}-${dark ? 'dark' : 'light'}.png` })
      }
    }
    assert.notEqual(colors.get('false:true'), colors.get('false:false'), 'light bubbles distinguish authorship')
    assert.notEqual(colors.get('true:true'), colors.get('true:false'), 'dark bubbles distinguish authorship')
    assert.notEqual(colors.get('false:true'), colors.get('true:true'), 'bubbles follow the active theme')
    await page.getByRole('button', { name: 'design', exact: true }).click()
    assert.equal(await page.locator('#opened').textContent(), 'test:docs/design.md')
    await page.getByRole('textbox').fill('단체 전송')
    await page.getByRole('textbox').press('Enter')
    await page.getByText('단체 전송', { exact: true }).waitFor()
    assert.equal(sent.at(-1)?.text, '단체 전송')
    assert.equal(sent.at(-1)?.to, undefined)
    assert.equal(await page.getByRole('textbox').inputValue(), '')
    await page.getByRole('button', { name: `Peer · ${peer}` }).click()
    await page.getByText('개인 대화 메시지', { exact: true }).waitFor()
    assert.equal(await page.locator('[data-chat-message="incoming"]').count(), 1)
    assert.equal(await page.getByText('내 첫 메시지', { exact: true }).count(), 0)
    await page.getByRole('textbox').fill('개인 전송')
    await page.getByRole('button', { name: '전송', exact: true }).click()
    await page.getByText('개인 전송', { exact: true }).waitFor()
    assert.deepEqual(sent.at(-1), { text: '개인 전송', to: [peer] })
    assert.equal(await page.locator('[data-chat-message="outgoing"]').count(), 1)
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
})
