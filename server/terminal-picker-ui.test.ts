import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs/promises'
import { build } from 'rolldown'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('terminal picker shows availability and selects installed backends by click and number', { timeout: 30_000 }, async () => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {TerminalPicker} from '${root}/src/components/TerminalPicker.tsx';
import {WorkspaceApiProvider} from '${root}/src/api/workspace-api-context.tsx';
localStorage.setItem('mew:locale','ko');window.selected=[];
const backends=[{id:'shell',label:'Shell',installed:true},{id:'tmux',label:'tmux',installed:true},{id:'zellij',label:'Zellij',installed:false},{id:'screen',label:'Screen',installed:true}];
createRoot(document.getElementById('root')).render(<WorkspaceApiProvider client={{fetch:async()=>new Response(JSON.stringify({backends}),{status:200,headers:{'Content-Type':'application/json'}})}}><TerminalPicker onSelect={id=>window.selected.push(id)}/></WorkspaceApiProvider>);`
  const bundle = await build({ input: 'virtual:picker.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } }, plugins: [{ name: 'fixture', async resolveId(id, importer) { if (id === 'virtual:picker.tsx') return id; if (id.endsWith('.css')) return 'virtual:style'; if (id.endsWith('?raw')) { const resolved = await this.resolve(id.slice(0, -4), importer, { skipSelf: true }); if (resolved) return `${resolved.id}?raw` } }, async load(id) { if (id === 'virtual:picker.tsx') return source; if (id === 'virtual:style') return ''; if (id.endsWith('?raw')) return `export default ${JSON.stringify(await fs.readFile(id.slice(0, -4), 'utf8'))}` } }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const browser = await connectTestBrowser()
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 700 } })
    await page.route('http://mew-picker.test/**', route => route.fulfill({ contentType: 'text/html', body: `<html><head><meta charset="utf-8"></head><body><div id="root"></div><script>${chunk.code}</script></body></html>` }))
    page.setDefaultTimeout(3000)
    await page.goto('http://mew-picker.test/')
    await page.getByRole('button', { name: /^기본 터미널/ }).waitFor()
    assert.equal(await page.getByRole('button', { name: /Zellij/ }).isDisabled(), true)
    await page.getByRole('button', { name: /^기본 터미널/ }).click()
    await page.getByRole('button', { name: /^tmux 터미널/ }).click()
    await page.locator('#root > div').focus()
    await page.keyboard.press('3')
    await page.keyboard.press('4')
    assert.deepEqual(await page.evaluate('window.selected'), ['shell', 'tmux', 'screen'])
  } finally { await browser.close() }
})
