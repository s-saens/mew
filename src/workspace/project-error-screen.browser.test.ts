import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { compile } from '@tailwindcss/node'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from '../../server/browser-dom-executable.ts'

test('project failure offers centered, usable recovery in full and compact panels', { skip: !domBrowserExecutable(), timeout: 30_000 }, async t => {
  const root = path.resolve(import.meta.dirname, '../..')
  const screen = path.join(root, 'src/workspace/project-error-screen.tsx')
  const boundary = path.join(root, 'src/components/app-error-boundary.tsx')
  const source = `import React from 'react'; import {createRoot} from 'react-dom/client';
    import {AppErrorBoundary} from ${JSON.stringify(boundary)}; import {ProjectErrorScreen} from ${JSON.stringify(screen)}; import {setUiLocale} from '@mew/ui/i18n-core'; setUiLocale('en');
    function Broken(){throw new Error('fixture failure')}
    createRoot(document.getElementById('root')).render(<AppErrorBoundary fallback={<ProjectErrorScreen onRecover={()=>{window.recovered=true}}/>}><Broken/></AppErrorBoundary>);`
  const result = await build({ input: 'virtual:project-error.tsx', write: false, platform: 'browser', output: { format: 'iife' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production') } },
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    plugins: [{ name: 'fixture', resolveId(id) { if (id === 'virtual:project-error.tsx') return id }, load(id) { if (id === 'virtual:project-error.tsx') return source; if (id.endsWith('.css')) return '' } }],
  })
  const script = result.output.find(item => item.type === 'chunk' && item.isEntry)!.code
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build((await fs.readFile(screen, 'utf8')).match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g) ?? [])
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  for (const [width, height] of [[1100, 800], [280, 240]]) {
    const page = await browser.newPage({ viewport: { width, height } })
    await page.route('http://project-error.test/**', route => route.fulfill({ contentType: 'text/html', body: `<html><style>html,body,#root{height:100%;margin:0}${css}</style><div id="root"></div><script>${script}</script></html>` }))
    await page.goto('http://project-error.test/')
    const alert = page.getByRole('alert'), refresh = alert.getByRole('button', { name: 'Refresh' }), select = alert.getByRole('button', { name: 'Choose project' })
    await select.waitFor()
    await select.scrollIntoViewIfNeeded()
    const box = await select.boundingBox(), container = await alert.boundingBox()
    assert.ok(box && container && box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= height)
    const card = await alert.locator(':scope > div').boundingBox()
    assert.ok(card && Math.abs(card.x + card.width / 2 - width / 2) < 2)
    if (height > 300) assert.ok(Math.abs(card.y + card.height / 2 - height / 2) < 2)
    await select.click()
    assert.equal(await page.evaluate('window.recovered'), true)
    const navigation = page.waitForNavigation()
    await refresh.click()
    await navigation
    await alert.waitFor()
    await page.close()
  }
})
