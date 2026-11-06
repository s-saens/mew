import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { connectTestBrowser } from './test-browser.ts'

const root = path.resolve(import.meta.dirname, '..')

test('database catalog displays persisted project-file-line references and Dock settings discard retired entries', { timeout: 45_000 }, async t => {
  const references = [
    { project: 'docs', path: 'planning.md', line: 7 },
    { project: 'docs', path: 'planning.md', line: 7 },
    { project: 'docs', path: 'planning.md', line: 29 },
    { project: 'research', path: 'long-directory/'.repeat(12) + 'findings.md', line: 103 },
  ]
  const summaries = [
    { id: 'tracked', title: 'Tracked database', references },
    { id: 'legacy', title: 'Legacy database' },
    { id: 'empty', title: 'No references', references: [] },
  ].map(item => ({ ...item, kind: 'managed', editable: true }))
  const source = `import React from 'react';import {createRoot} from 'react-dom/client';
import {DatabaseListModal} from '${root}/src/components/DatabaseListModal.tsx';
import {DockSettingsPanel} from '${root}/src/components/dock-settings-panel.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {applyThemePalette,THEME_PRESETS} from '${root}/src/utils/theme-color.ts';
applyThemePalette(THEME_PRESETS.find(p=>p.id===new URL(location.href).searchParams.get('theme')).palette);
const summaries=${JSON.stringify(summaries)};
const api={list:async()=>summaries,getView:async id=>({...summaries.find(item=>item.id===id),columns:[],rows:[]}),subscribe:()=>()=>{}};
function Fixture(){const [open,setOpen]=React.useState(true);return open?<DatabaseListModal api={api} project="docs" onClose={()=>setOpen(false)}/>:<DockSettingsPanel/>}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const candidates = [source], styles: string[] = []
  const bundle = await build({ input: 'virtual:database-catalog.tsx', write: false, platform: 'browser', output: { format: 'esm', codeSplitting: false },
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'database-catalog-fixture', resolveId(id) { if (id === 'virtual:database-catalog.tsx') return id }, async load(id) {
      if (id === 'virtual:database-catalog.tsx') return source
      if (id.endsWith('.css')) { styles.push(await fs.readFile(id, 'utf8')); return { code: '', moduleType: 'js' } }
      if (id.endsWith('.tsx')) candidates.push(await fs.readFile(id, 'utf8'))
    } }],
  })
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set(candidates.join('\n').match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))]) + styles.join('\n')
  const code = bundle.output.find(item => item.type === 'chunk')!.code
  const browser = await connectTestBrowser()
  t.after(() => browser.close())
  for (const width of [390, 1100]) for (const theme of ['midnight', 'light']) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: width < 500, hasTouch: width < 500 })
    page.setDefaultTimeout(5000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      localStorage.setItem('mew:locale', 'en')
      localStorage.setItem('mew:mobile-dock-order', JSON.stringify(['database', 'chat', 'editor', 'sidebar']))
      localStorage.setItem('mew:mobile-dock-hidden', JSON.stringify(['database']))
    })
    await page.route('http://mew-database-catalog.test/**', route => route.fulfill(new URL(route.request().url()).pathname === '/app.js'
      ? { contentType: 'text/javascript', body: code }
      : { contentType: 'text/html', body: `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script type="module" src="/app.js"></script></html>` }))
    await page.goto(`http://mew-database-catalog.test/?theme=${theme}`)
    const region = page.getByRole('region', { name: 'Database reference', exact: true })
    await region.getByRole('heading', { name: 'Database reference (4)', exact: true }).waitFor()
    assert.deepEqual(await region.locator('li').allTextContents().then(lines => lines.map(line => line.replace(/\s+/g, ' ').trim())),
      references.map(reference => `${reference.project} / ${reference.path} : Line ${reference.line}`))
    const bounds = await region.evaluate(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth, right: el.getBoundingClientRect().right, viewport: el.ownerDocument.defaultView!.innerWidth }))
    assert.ok(bounds.scrollWidth <= bounds.width && bounds.right <= bounds.viewport, 'long project/file locations wrap inside the mobile dialog')
    if (process.env.MEW_DATABASE_CATALOG_SCREENSHOTS) {
      await fs.mkdir(process.env.MEW_DATABASE_CATALOG_SCREENSHOTS, { recursive: true })
      await page.screenshot({ path: path.join(process.env.MEW_DATABASE_CATALOG_SCREENSHOTS, `${theme}-${width}.png`) })
    }
    for (const title of ['Legacy database', 'No references']) {
      await page.getByRole('button', { name: title, exact: true }).click()
      await region.getByRole('heading', { name: 'Database reference (0)', exact: true }).waitFor()
      assert.equal(await region.locator('li').count(), 0)
      assert.equal(await region.getByText('No items', { exact: true }).count(), 1)
    }
    await page.getByRole('button', { name: 'Tracked database', exact: true }).click()
    await region.getByRole('heading', { name: 'Database reference (4)', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await page.locator('[data-dock-settings]').waitFor()
    assert.equal(await page.locator('[data-dock-setting="database"]').count(), 0)
    assert.equal(await page.locator('[data-dock-preview="database"]').count(), 0)
    assert.deepEqual((await page.locator('[data-dock-setting]').evaluateAll(elements => elements.map(el => el.getAttribute('data-dock-setting')))).filter(id => ['chat', 'editor', 'sidebar'].includes(id!)), ['chat', 'editor', 'sidebar'], 'other customized Dock order is retained')
    assert.deepEqual(errors, [])
    await page.close()
  }
})
