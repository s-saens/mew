import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

test('content search keeps Korean matches highlighted and visible in narrow results', { skip: !domBrowserExecutable(), timeout: 60_000 }, async () => {
  const root = path.resolve(import.meta.dirname, '..')
  const workspaceExports = new Map<string, string>()
  for (const name of ['editor', 'ui', 'mobile-keys', 'shortcuts', 'tmux-term']) {
    const directory = path.join(root, 'packages', name)
    const pkg = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'))
    for (const [entry, target] of Object.entries(pkg.exports as Record<string, string>)) {
      workspaceExports.set(`@mew/${name}${entry === '.' ? '' : entry.slice(1)}`, path.resolve(directory, target))
    }
  }
  const query = '사이드바'
  const texts = ['    사이드바 열기', `${'앞 문맥 '.repeat(50)}사이드바 뒤 문맥`, '<script>사이드바</script>']
  const matches = texts.map((text, index) => ({ line: index + 1, column: 700 + index, text, matchStart: text.indexOf(query), matchEnd: text.indexOf(query) + query.length }))
  const result = { path: '검색.md', matches }
  const source = `import React from ${JSON.stringify(import.meta.resolve('react'))};
import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
import {SearchPanel} from ${JSON.stringify(path.join(root, 'src/components/SearchPanel.tsx'))};
import {I18nProvider} from ${JSON.stringify(path.join(root, 'src/i18n.tsx'))};
import {applyThemePalette,THEME_PRESETS} from ${JSON.stringify(path.join(root, 'src/utils/theme-color.ts'))};
localStorage.setItem('mew:locale','ko');
applyThemePalette(THEME_PRESETS.find(p=>p.id===new URLSearchParams(location.search).get('theme')).palette);
createRoot(document.getElementById('root')).render(<I18nProvider><main className="h-full bg-surface-deep" style={{width:240}}><SearchPanel focusSignal={0} readOnly={true} project="fixture" scopes={[]} mode="content" onOpenResult={(...args)=>window.openedResult=args} onReplaced={()=>{}}/></main></I18nProvider>);`
  const candidates = [source], styles: string[] = []
  const bundle = await build({ input: 'virtual:search-panel.tsx', write: false, platform: 'browser', output: { format: 'esm', codeSplitting: false },
    onwarn(warning, defaultHandler) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') defaultHandler(warning) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{
      name: 'search-panel-fixture',
      resolveId(id) { if (id === 'virtual:search-panel.tsx') return id; return workspaceExports.get(id) },
      async load(id) {
        if (id === 'virtual:search-panel.tsx') return source
        if (id.endsWith('.tsx')) candidates.push(await fs.readFile(id, 'utf8'))
        if (id.endsWith('.css')) { styles.push(await fs.readFile(id, 'utf8')); return { code: '', moduleType: 'js' } }
      },
    }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk' && item.isEntry)!
  assert.ok(chunk.type === 'chunk')
  const compiler = await compile(await fs.readFile(path.join(root, 'src/index.css'), 'utf8'), { base: path.join(root, 'src'), onDependency() {} })
  const css = compiler.build([...new Set(candidates.join('\n').match(/[A-Za-z0-9_@!&:/.[\]()%,-]+/g))]) + styles.join('\n')
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    for (const { width, theme } of [{ width: 1100, theme: 'midnight' }, { width: 390, theme: 'rose' }]) {
      const page = await browser.newPage({ viewport: { width, height: 640 }, hasTouch: width < 768, isMobile: width < 768 })
      page.setDefaultTimeout(5000)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('http://mew-search-panel.test/**', route => {
        const pathname = new URL(route.request().url()).pathname
        if (pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: chunk.code })
        if (pathname === '/api/search/stream') return route.fulfill({ contentType: 'text/event-stream', body: `event: result\ndata: ${JSON.stringify(result)}\n\nevent: done\ndata: {"truncated":false,"state":"ready"}\n\n` })
        if (pathname.startsWith('/api/')) return route.fulfill({ json: [] })
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script type="module" src="/app.js"></script></html>` })
      })
      await page.goto(`http://mew-search-panel.test/?theme=${theme}`)
      await page.locator('input').fill(query)
      const marks = page.locator('mark')
      await marks.nth(2).waitFor()
      assert.deepEqual(await marks.allTextContents(), [query, query, query])
      for (const mark of await marks.all()) {
        const view = await mark.evaluate(el => {
          const box = el.getBoundingClientRect()
          const row = el.closest('button')!.getBoundingClientRect()
          const style = el.ownerDocument.defaultView!.getComputedStyle(el)
          return { left: box.left, right: box.right, width: box.width, rowLeft: row.left, rowRight: row.right, background: style.backgroundColor, weight: style.fontWeight }
        })
        assert.ok(view.width > 0 && view.left >= view.rowLeft && view.right <= view.rowRight, 'the entire Korean match remains inside the result row')
        assert.ok(!['transparent', 'rgba(0, 0, 0, 0)'].includes(view.background), 'the highlight has a visible background')
        assert.ok(Number(view.weight) >= 600, 'the match stands out from the surrounding text')
      }
      assert.equal(await page.locator('main script').count(), 0, 'preview text is escaped')
      await marks.nth(1).click()
      const opened = await page.evaluate('window.openedResult') as [string, typeof matches[number], string]
      assert.equal(opened[0], result.path)
      assert.equal(opened[1].column, matches[1].column, 'clicking a preview preserves its original document column')
      assert.equal(opened[2], query)
      assert.deepEqual(errors, [])
      if (process.env.MEW_UI_SCREENSHOTS) {
        await fs.mkdir(process.env.MEW_UI_SCREENSHOTS, { recursive: true })
        await page.screenshot({ path: path.join(process.env.MEW_UI_SCREENSHOTS, `search-panel-${width}-${theme}.png`) })
      }
      await page.close()
    }
  } finally { await browser.close() }
})
