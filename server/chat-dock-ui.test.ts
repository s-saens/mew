import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('chat Dock supports touch and keyboard selection with translated labels and permission visibility', { timeout: 30_000 }, async t => {
  const source = `import React from 'react';import {createRoot} from 'react-dom/client';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {MobileDock} from '${root}/src/components/mobile-dock.tsx';
import {setDockPanelVisible,setDockOrder} from '${root}/src/hooks/use-dock-preferences.ts';
window.actions=[];
function Fixture(){const [allowed,setAllowed]=React.useState(true);const [open,setOpen]=React.useState(false);window.allowChat=setAllowed;window.showChat=visible=>setDockPanelVisible('chat',visible);window.chatFirst=()=>setDockOrder(['chat','editor']);return <div className="mew-workspace h-dvh bg-surface-deep text-ink"><MobileDock active={open?'chat':'editor'} openPanels={open?['editor','chat']:['editor']} available={allowed?['editor','chat']:['editor']} hidden={false} position="bottom" onSelect={id=>{window.actions.push(id);if(id==='chat')setOpen(value=>!value)}} onNavigate={()=>{}}/></div>}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:chat-dock.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false },
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'chat-dock', resolveId(id) { if (id === 'virtual:chat-dock.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' }, load(id) { if (id === 'virtual:chat-dock.tsx') return source; if (id === 'virtual:style') return '' } }],
  })
  const code = bundle.output.find(item => item.type === 'chunk')!.code
  const content = (await Promise.all(['src/components/mobile-dock.tsx', 'packages/ui/src/HoverTipLayer.tsx'].map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set((source + content).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  for (const { width, locale, label } of [{ width: 390, locale: 'en', label: 'Chat' }, { width: 1100, locale: 'ko', label: '채팅' }]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width === 390 })
    page.setDefaultTimeout(4000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(`localStorage.setItem('mew:locale','${locale}')`)
    await page.route('http://mew-chat-dock.test/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script>${code}</script></html>` }))
    await page.goto('http://mew-chat-dock.test/')
    const chat = page.locator('[data-dock-item="chat"]')
    await chat.waitFor()
    assert.equal(await chat.getAttribute('aria-label'), label)
    assert.equal(await chat.getAttribute('data-tip'), label)
    assert.equal(await chat.getAttribute('aria-pressed'), 'false')
    assert.equal(await chat.getAttribute('aria-haspopup'), null)
    if (width === 390) await chat.tap()
    else await chat.click()
    assert.deepEqual(await page.evaluate('window.actions'), ['chat'])
    assert.equal(await chat.getAttribute('aria-pressed'), 'true', 'Chat uses the same open-panel semantics as other Dock panels')
    assert.equal(await chat.getAttribute('aria-current'), 'true')
    const bounds = (await chat.boundingBox())!
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.height <= 44)
    await chat.focus()
    await page.keyboard.press('Enter')
    assert.deepEqual(await page.evaluate('window.actions'), ['chat', 'chat'])
    assert.equal(await chat.getAttribute('aria-pressed'), 'false')
    await page.evaluate('window.allowChat(false)')
    await chat.waitFor({ state: 'hidden' })
    await page.evaluate('window.allowChat(true);window.showChat(false)')
    await chat.waitFor({ state: 'hidden' })
    await page.evaluate('window.showChat(true);window.chatFirst()')
    await chat.waitFor()
    assert.equal(await page.locator('[data-dock-item]').first().getAttribute('data-dock-item'), 'chat')
    await page.reload()
    await chat.waitFor()
    assert.equal(await page.locator('[data-dock-item]').first().getAttribute('data-dock-item'), 'chat', 'Chat participates in saved Dock order')
    assert.deepEqual(errors, [])
    await page.close()
  }
})
