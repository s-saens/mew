import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

test('file explorer dock, controls and shortcut labels update together across languages', { skip: !domBrowserExecutable(), timeout: 30_000 }, async () => {
  const root = path.resolve(import.meta.dirname, '..')
  const shortcuts = JSON.parse(await fs.readFile(`${root}/packages/shortcuts/src/shortcuts.json`, 'utf8')) as { id: string; label: string; keys: string }[]
  const shortcut = shortcuts.find(item => item.id === 'toggleSidebar')!
  assert.equal(shortcut.keys, 'Ctrl+B')
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {I18nProvider,useI18n,localizeShortcut} from '${root}/src/i18n.tsx';
import {MobileDock} from '${root}/src/components/mobile-dock.tsx';
import {uiText} from '@mew/ui/i18n-core';
localStorage.setItem('mew:locale','ko');
function Fixture(){const {locale,setLocale,t}=useI18n();window.changeLanguage=setLocale;return <>
<MobileDock active="editor" available={['sidebar','editor']} hidden={false} onSelect={id=>window.selected=id} onNavigate={()=>{}}/>
<button id="open" aria-label={t('sidebar.open')} title={uiText('파일 탐색기 열기 (Ctrl+B)')}>{t('sidebar.open')}</button>
<button id="close" aria-label={uiText('파일 탐색기 닫기')}>{uiText('파일 탐색기 닫기')}</button>
<span id="shortcut">{localizeShortcut(locale,'toggleSidebar',${JSON.stringify(shortcut.label)})}</span></>}
createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);`
  const bundle = await build({ input: 'virtual:explorer-labels.tsx', write: false, platform: 'browser', output: { format: 'iife', codeSplitting: false },
    onwarn(warning, defaultHandler) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') defaultHandler(warning) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{
      name: 'explorer-labels-fixture',
      resolveId(id) { if (id === 'virtual:explorer-labels.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' },
      load(id) { if (id === 'virtual:explorer-labels.tsx') return source; if (id === 'virtual:style') return '' },
    }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    for (const width of [1100, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 640 }, hasTouch: width < 768 })
      page.setDefaultTimeout(4000)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('http://mew-explorer-labels.test/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script>${chunk.code}</script></html>` }))
      await page.goto('http://mew-explorer-labels.test/')
      const dockItem = page.locator('[data-dock-item=sidebar]')
      await dockItem.waitFor()
      for (const [locale, label, open, close, toggle] of [
        ['ko', '파일 탐색기', '파일 탐색기 열기', '파일 탐색기 닫기', '파일 탐색기 열기/닫기'],
        ['en', 'File explorer', 'Open file explorer', 'Close file explorer', 'Open/close file explorer'],
        ['zh-CN', '文件资源管理器', '打开文件资源管理器', '关闭文件资源管理器', '打开/关闭文件资源管理器'],
        ['ja', 'ファイルエクスプローラー', 'ファイルエクスプローラーを開く', 'ファイルエクスプローラーを閉じる', 'ファイルエクスプローラーを開く/閉じる'],
      ]) {
        await page.evaluate(locale => (globalThis as any).changeLanguage(locale), locale)
        await page.getByRole('button', { name: label, exact: true }).waitFor()
        assert.equal(await dockItem.getAttribute('data-tip'), label)
        assert.equal(await page.locator('#open').getAttribute('aria-label'), open)
        assert.equal(await page.locator('#open').getAttribute('title'), `${open} (Ctrl+B)`)
        assert.equal(await page.locator('#close').getAttribute('aria-label'), close)
        assert.equal(await page.locator('#shortcut').innerText(), toggle)
        await dockItem.click()
        assert.equal(await page.evaluate('window.selected'), 'sidebar', 'renaming the label preserves the panel identifier')
      }
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally { await browser.close() }
})
