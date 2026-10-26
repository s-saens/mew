import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

const root = path.resolve(import.meta.dirname, '..')

test('capacity retry notice shows the next retry, stops with keyboard input and fits narrow translated layouts', { skip: !domBrowserExecutable(), timeout: 30_000 }, async () => {
  const source = `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {I18nProvider} from '${root}/src/i18n.tsx';
import {AgentCapacityRetryNotice} from '${root}/src/components/agent-capacity-retry-notice.tsx';
import {applyThemePalette,THEME_PRESETS} from '${root}/src/utils/theme-color.ts';
const root=createRoot(document.getElementById('root'));
window.stops=0;
window.renderNotice=(seconds,attempt=1)=>root.render(<I18nProvider>{seconds===null?null:<AgentCapacityRetryNotice state={{attempt,maxRetries:20,retryAt:30000}} now={30000-seconds*1000} onCancel={()=>window.stops++}/>}</I18nProvider>);
window.theme=dark=>applyThemePalette(THEME_PRESETS.find(theme=>theme.id===(dark?'dark':'light')).palette);
window.renderNotice(30);`
  const bundle = await build({ input: 'virtual:capacity-notice.tsx', platform: 'browser', write: false, onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) }, output: { format: 'iife' }, transform: { jsx: 'react-jsx' }, plugins: [{
    name: 'capacity-notice-fixture',
    resolveId(id) { if (id === 'virtual:capacity-notice.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' },
    load(id) { if (id === 'virtual:capacity-notice.tsx') return source; if (id === 'virtual:style') return '' },
  }] })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const content = source + await fs.readFile(`${root}/src/components/agent-capacity-retry-notice.tsx`, 'utf8')
  const compiler = await compile(await fs.readFile(`${root}/src/index.css`, 'utf8'), { base: `${root}/src`, onDependency() {} })
  const css = compiler.build([...new Set(content.match(/[A-Za-z0-9_@!:/.[\]()%,-]+/g))])
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    for (const [locale, waiting, countdown, stop] of [
      ['ko', '모델 혼잡', '30초 뒤 재시도', '재시도 중단'],
      ['en', 'Model at capacity', 'Retrying in 30s', 'Stop retrying'],
      ['ja', 'モデルが混雑中', '30秒後に再試行', '再試行を中止'],
      ['zh-CN', '模型繁忙', '30秒后重试', '停止重试'],
    ]) {
      for (const width of [1100, 320]) {
        const page = await browser.newPage({ viewport: { width, height: 180 }, hasTouch: width < 768, isMobile: width < 768 })
        page.setDefaultTimeout(4000)
        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message))
        await page.addInitScript(value => localStorage.setItem('mew:locale', value), locale)
        await page.route('http://mew-capacity-notice.test/**', route => route.fulfill(new URL(route.request().url()).pathname === '/app.js'
          ? { contentType: 'text/javascript', body: chunk.code }
          : { contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/app.js"></script>` }))
        await page.goto('http://mew-capacity-notice.test/')
        const status = page.getByRole('status'), cancel = page.getByRole('button', { name: stop, exact: true })
        await status.filter({ hasText: waiting }).waitFor()
        assert.ok((await status.innerText()).includes(countdown))
        assert.ok((await status.innerText()).includes('(1/20)'))
        await cancel.focus()
        await page.keyboard.press('Enter')
        assert.equal(await page.evaluate('window.stops'), 1, 'keyboard stop reaches the same cancellation callback')
        await page.evaluate('window.renderNotice(0.1,20)')
        await status.filter({ hasText: '(20/20)' }).waitFor()
        await page.getByText(countdown.replace('30', '1'), { exact: true }).waitFor()
        await page.evaluate('window.renderNotice(-1,20)')
        await status.filter({ hasText: '(20/20)' }).waitFor()
        await page.getByText(countdown.replace('30', '0'), { exact: true }).waitFor()
        await page.evaluate(`window.renderNotice(30);window.theme(${width === 1100})`)
        await status.filter({ hasText: countdown }).waitFor()
        const bounds = (await cancel.boundingBox())!
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, 'stop remains reachable in the viewport')
        assert.ok(bounds.height >= (width < 768 ? 32 : 24), 'stop keeps the established pointer/touch target')
        assert.equal(await page.locator('body').evaluate(el => el.scrollWidth > el.clientWidth), false, 'translated notice has no horizontal overflow')
        if (locale === 'ko') await page.screenshot({ path: path.join(os.tmpdir(), `mew-capacity-retry-notice-${width}.png`) })
        await page.evaluate('window.renderNotice(null)')
        await status.waitFor({ state: 'hidden' })
        assert.deepEqual(errors, [])
        await page.close()
      }
    }
  } finally { await browser.close() }
})
