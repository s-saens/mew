import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, mkdir } from 'node:fs/promises'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from '../server/browser-dom-executable.ts'
import { translateUi } from '@mew/ui/i18n-core'

test('missing pages render before authentication and preserve recovery, themes and supported entries', { skip: !domBrowserExecutable(), timeout: 30_000 }, async () => {
  const root = new URL('../', import.meta.url).pathname
  const bundle = await build({
    input: `${root}src/main.tsx`, write: false, platform: 'browser',
    output: { format: 'esm' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': '"production"', 'import.meta.hot': 'false' } },
    onwarn(warning, report) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE' || !warning.id?.includes('/iconoir-react/')) report(warning) },
    plugins: [{ name: 'entry-fixture', resolveId(id) { if (id.endsWith('.css')) return 'virtual:style' }, load(id) {
      if (id === 'virtual:style') return ''
      if (id === `${root}src/AppBootstrap.tsx`) return 'export default function Workspace(){return <main data-workspace>Workspace</main>}'
      if (id === `${root}src/components/public-share-page.tsx`) return 'export function PublicSharePage(){return <main data-share>Shared document</main>}'
      if (id === `${root}src/utils/remote-app.ts`) return 'export async function initializeRemoteApp(){return undefined}'
    } }],
  })
  const scripts = new Map(bundle.output.filter(item => item.type === 'chunk').map(item => [`/${item.fileName}`, item.code]))
  const entry = bundle.output.find(item => item.type === 'chunk' && item.isEntry)!
  const compiler = await compile(`${await readFile(`${root}src/index.css`, 'utf8')}\n${await readFile(`${root}src/components/not-found-page.css`, 'utf8')}`, { base: `${root}src`, onDependency() {} })
  const css = compiler.build(['mew-workspace', 'text-ink', 'bg-surface'])
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  const captures = '/tmp/mew-404-review'
  await mkdir(captures, { recursive: true })
  try {
    for (const width of [1440, 390, 320]) for (const dark of [true, false]) {
      const page = await browser.newPage({ viewport: { width, height: 800 }, reducedMotion: 'reduce' })
      page.setDefaultTimeout(4000)
      const errors: string[] = [], requests: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('http://mew-404.test/**', async route => {
        const url = new URL(route.request().url())
        requests.push(url.pathname)
        if (scripts.has(url.pathname)) return route.fulfill({ contentType: 'text/javascript', body: scripts.get(url.pathname) })
        if (url.pathname.startsWith('/fonts/')) return route.fulfill({ body: await readFile(`${root}public${url.pathname}`) })
        const remote = url.pathname.startsWith('/__mew_ui/')
        const locale = url.searchParams.get('locale') ?? 'ko'
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${remote ? '<meta name="mew-p2p-app">' : ''}<style>${css}</style><div id="root"></div><script>localStorage.setItem('mew:locale',${JSON.stringify(locale)});${dark ? '' : "localStorage.setItem('mew:theme','light');"}</script><script type="module" src="/${entry.fileName}"></script></html>` })
      })
      await page.goto('http://mew-404.test/missing')
      await page.getByRole('heading', { name: '이 페이지는 잠시 길을 잃었어요.' }).waitFor()
      assert.equal(await page.locator('html').evaluate(el => el.classList.contains('dark')), dark, 'saved theme is applied')
      assert.equal(requests.some(path => path.startsWith('/api/')), false, 'a missing route needs no authentication or workspace API')
      assert.equal(await page.locator('[data-workspace]').count(), 0)
      const main = page.getByRole('main')
      assert.equal(await main.evaluate(el => el.scrollWidth <= el.clientWidth), true, 'no horizontal overflow')
      assert.equal(await page.locator('.mew-not-found-zero').evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).animationName), 'none')
      const home = page.locator('.mew-not-found-home')
      assert.equal(await home.getAttribute('href'), '/')
      const box = await home.boundingBox()
      assert.ok(box && box.height >= 44 && box.y + box.height <= 800, 'primary action remains visible and touch accessible')
      await page.keyboard.press('Tab')
      assert.equal(await page.locator('.mew-not-found-brand').evaluate(el => el === el.ownerDocument.activeElement), true)
      await page.keyboard.press('Tab')
      assert.equal(await home.evaluate(el => el === el.ownerDocument.activeElement), true)
      if (width !== 320) await page.screenshot({ path: `${captures}/${width === 1440 ? 'desktop' : 'mobile'}-${dark ? 'dark' : 'light'}.png`, fullPage: true })
      await home.click()
      await page.locator('[data-workspace]').waitFor()
      await page.goto('http://mew-404.test/missing')
      await page.getByRole('button', { name: '이전 페이지로' }).click()
      await page.locator('[data-workspace]').waitFor()
      for (const path of ['/index.html', '/?preview=3000', '/__mew_ui/opaque/index.html']) {
        await page.goto(`http://mew-404.test${path}`)
        await page.locator('[data-workspace]').waitFor()
      }
      await page.goto(`http://mew-404.test/share/f/${'a'.repeat(43)}`)
      await page.locator('[data-share]').waitFor()
      await page.goto('http://mew-404.test/share/f/invalid')
      await page.getByRole('heading', { name: '이 페이지는 잠시 길을 잃었어요.' }).waitFor()
      for (const locale of ['en', 'zh-CN', 'ja'] as const) {
        await page.goto(`http://mew-404.test/missing?locale=${locale}`)
        await page.getByRole('heading', { name: translateUi(locale, '이 페이지는 잠시 길을 잃었어요.') }).waitFor()
        assert.equal(await main.evaluate(el => el.scrollWidth <= el.clientWidth), true, `${locale} does not overflow`)
      }
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.goto('http://mew-404.test/missing')
      await page.getByRole('heading', { name: '이 페이지는 잠시 길을 잃었어요.' }).waitFor()
      assert.equal(await page.locator('.mew-not-found-zero').evaluate(el => el.ownerDocument.defaultView!.getComputedStyle(el).animationName), 'mew-not-found-settle')
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally { await browser.close() }
})
