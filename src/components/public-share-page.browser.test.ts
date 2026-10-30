import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import { build } from 'rolldown'
import { compile } from '@tailwindcss/node'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from '../../server/browser-dom-executable.ts'

const root = new URL('../../', import.meta.url).pathname
const id = 'a'.repeat(43)

test('anonymous public routes render real editors, autosave safely, browse only shared folders and clear revoked content', { skip: !domBrowserExecutable(), timeout: 45_000 }, async () => {
  const styles: string[] = []
  const bundle = await build({
    input: `${root}src/main.tsx`, logLevel: 'silent', write: false, platform: 'browser', output: { format: 'esm' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production'), 'import.meta.hot': 'undefined' } },
    plugins: [{
      name: 'anonymous-public-page',
      resolveId(source) {
        if (source.endsWith('.css')) return 'virtual:style'
        if (source.endsWith('AppBootstrap.tsx')) return 'virtual:forbidden-auth'
      },
      async load(source) {
        if (source === 'virtual:style') return ''
        if (source === 'virtual:forbidden-auth') return "throw new Error('Anonymous public routes must bypass workspace authentication');export default function Forbidden(){return null}"
        if (source.endsWith('?raw')) return 'export default ' + JSON.stringify(await fs.readFile(source.slice(0, -4), 'utf8'))
      },
    }],
  })
  const chunks = bundle.output.filter(chunk => chunk.type === 'chunk')
  const entry = chunks.find(chunk => chunk.isEntry)!
  const scripts = new Map(chunks.map(chunk => [`/${chunk.fileName}`, chunk.code]))
  const sources = ['src/components/public-share-page.tsx', 'src/components/CodePane.tsx', 'packages/editor/src/Editor.tsx', 'packages/ui/src/loading-indicator.tsx']
  const content = (await Promise.all(sources.map(file => fs.readFile(`${root}${file}`, 'utf8')))).join('\n')
  const compiler = await compile(await fs.readFile(`${root}src/index.css`, 'utf8'), { base: `${root}src`, onDependency() {} })
  styles.push(compiler.build([...new Set(content.match(/[A-Za-z0-9_@:/.[\]()%,-]+/g))]))
  styles.push(await fs.readFile(`${root}packages/editor/src/editor/editor.css`, 'utf8'))
  styles.push(await fs.readFile(`${root}packages/ui/src/loading-indicator.css`, 'utf8'))
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
    page.setDefaultTimeout(6000)
    const errors: string[] = [], requests: string[] = [], writes: { path: string; content: string; tag: string }[] = []
    page.on('pageerror', error => errors.push(error.message))
    let mode: 'view' | 'edit' = 'view'
    let revoked = false
    let conflict = false
    let revision = 1
    const files = new Map([['', '# Published document\n\nA document open to everyone.\n'], ['root.txt', 'root file'], ['notes/guide.md', '# Nested guide\n\nFolder content.\n']])
    const file = (path: string) => ({ path, name: path.split('/').pop() || 'README.md', content: files.get(path)!, version: { size: files.get(path)!.length, mtimeMs: revision, ctimeMs: revision, tag: `v${revision}` } })
    await page.route('http://public-document.test/**', async route => {
      const url = new URL(route.request().url())
      requests.push(url.pathname + url.search)
      if (/^\/api\/public-shares\/[fd]\/[A-Za-z0-9_-]+$/.test(url.pathname)) {
        if (revoked) { await route.fulfill({ status: 404, json: { error: 'revoked' } }); return }
        await route.fulfill({ json: { name: url.pathname.includes('/d/') ? 'Published folder' : 'README.md', type: url.pathname.includes('/d/') ? 'd' : 'f', mode } }); return
      }
      if (url.pathname.endsWith('/tree')) {
        await route.fulfill({ json: { tree: url.searchParams.get('path') === 'notes'
          ? [{ name: 'guide.md', path: 'notes/guide.md', type: 'file' }]
          : [{ name: 'root.txt', path: 'root.txt', type: 'file' }, { name: 'archive.bin', path: 'archive.bin', type: 'file' }, { name: 'notes', path: 'notes', type: 'dir' }] } }); return
      }
      if (url.pathname.endsWith('/file')) {
        if (url.searchParams.get('path') === 'archive.bin') { await route.fulfill({ status: 415, json: { error: 'Binary content' } }); return }
        if (route.request().method() === 'PUT') {
          const body = route.request().postDataJSON()
          writes.push({ path: body.path, content: body.content, tag: body.baseVersion.tag })
          if (conflict) { await route.fulfill({ status: 409, json: { error: 'changed externally' } }); return }
          files.set(body.path, body.content); revision++
          await route.fulfill({ json: file(body.path) }); return
        }
        await route.fulfill({ json: file(url.searchParams.get('path') || '') }); return
      }
      if (url.pathname.startsWith('/api/')) { await route.fulfill({ status: 403, json: { error: 'Workspace access is unavailable' } }); return }
      const script = scripts.get(url.pathname)
      await route.fulfill(script !== undefined ? { contentType: 'text/javascript', body: script }
        : { contentType: 'text/html', body: `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles.join('\n')}</style><div id="root"></div><script type="module" src="/${entry.fileName}"></script></html>` })
    })
    await page.addInitScript("localStorage.setItem('mew:locale','en')")
    await page.goto(`http://public-document.test/share/f/${id}`)
    await page.locator('.tiptap h1').waitFor()
    assert.equal(await page.locator('.tiptap h1').textContent(), 'Published document')
    assert.equal(await page.locator('.tiptap').getAttribute('contenteditable'), 'false')
    assert.equal(await page.locator('aside').count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).count(), 0)
    assert.equal(requests.some(request => request.startsWith('/api/auth/')), false, 'public entry never loads the account gate')
    await page.screenshot({ path: '/tmp/mew-public-document-desktop.png' })
    await page.getByRole('button', { name: 'Source', exact: true }).click()
    const code = page.locator('.cm-content')
    await code.waitFor()
    assert.equal(await code.getAttribute('contenteditable'), 'false')
    await code.click()
    await page.keyboard.type('MUST NOT WRITE')
    assert.equal((await code.textContent())?.includes('MUST NOT WRITE'), false)
    assert.equal(writes.length, 0)
    mode = 'edit'
    await page.evaluate('window.dispatchEvent(new Event("focus"))')
    await page.locator('.cm-content[contenteditable="true"]').waitFor()
    await code.fill('Public edited content')
    await page.getByRole('status').filter({ hasText: /^Saved$/ }).waitFor()
    assert.equal(files.get(''), 'Public edited content')
    assert.equal(writes.length, 1)
    assert.equal(writes[0].tag, 'v1')
    conflict = true
    await code.fill('Keep this conflicting draft')
    await page.getByRole('alert').filter({ hasText: 'This file changed elsewhere.' }).waitFor()
    assert.equal(await code.textContent(), 'Keep this conflicting draft')
    assert.equal(files.get(''), 'Public edited content')
    const failedWrites = writes.length
    await page.waitForTimeout(800)
    assert.equal(writes.length, failedWrites, 'conflict does not trigger an automatic retry loop')
    revoked = true
    await page.evaluate('window.dispatchEvent(new Event("focus"))')
    await page.getByRole('alert').filter({ hasText: 'This public link is unavailable.' }).waitFor()
    assert.equal(await page.locator('[data-public-share-editor]').count(), 0)
    assert.equal(await page.locator('.cm-content').count(), 0)
    assert.equal(await page.locator('.tiptap').count(), 0)

    revoked = false; conflict = false; mode = 'view'
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`http://public-document.test/share/d/${id}`)
    await page.getByRole('tree').waitFor()
    assert.equal(await page.locator('[data-public-share-editor]').count(), 0)
    assert.equal(requests.filter(request => request.includes('/tree?path=notes')).length, 0, 'subfolders are not fetched before expansion')
    await page.getByRole('button', { name: 'notes', exact: true }).click()
    await page.getByRole('button', { name: 'guide.md', exact: true }).click()
    await page.locator('.tiptap h1').waitFor()
    assert.equal(await page.locator('.tiptap h1').textContent(), 'Nested guide')
    assert.equal(requests.filter(request => request.includes('/tree?path=notes')).length, 1)
    assert.ok(requests.some(request => request.includes('/file?path=notes%2Fguide.md')))
    assert.equal(await page.locator('.tiptap').getAttribute('contenteditable'), 'false')
    const mainBox = await page.locator('main').boundingBox()
    assert.ok(mainBox && mainBox.width > 190 && mainBox.x + mainBox.width <= 391)
    await page.screenshot({ path: '/tmp/mew-public-document-mobile.png' })
    await page.getByRole('button', { name: 'root.txt', exact: true }).click()
    await page.locator('.cm-content').waitFor()
    assert.equal(await page.locator('.cm-content').textContent(), 'root file')
    await page.getByRole('button', { name: 'archive.bin', exact: true }).click()
    const download = page.getByRole('link', { name: 'Download', exact: true })
    await download.waitFor()
    assert.equal(await download.getAttribute('href'), `/api/public-shares/d/${id}/raw?path=archive.bin`)
    assert.equal(await download.getAttribute('download'), 'archive.bin')
    assert.equal(await page.locator('[data-public-share-editor]').count(), 0)
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
