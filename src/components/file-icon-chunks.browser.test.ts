import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from '../../server/browser-dom-executable.ts'
import { startupCodeSplitting } from '../../server/startup-chunks.ts'

async function fixtureBundle() {
  const root = new URL('../../', import.meta.url).pathname
  const source = `import React from ${JSON.stringify(import.meta.resolve('react'))};import{createRoot}from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
import{FileTypeIcon,FolderTypeIcon}from'${root}src/components/file-type-icon.tsx';import{IconPackProvider}from'${root}src/components/icon-pack-context.tsx';
function Fixture(){const[pack,setPack]=React.useState('material'),[name,setName]=React.useState('unknown.xyz'),[shown,setShown]=React.useState(true);window.setPack=setPack;window.setName=setName;return <IconPackProvider value={pack}><button onClick={()=>setShown(value=>!value)}>Toggle</button><div data-file>{shown&&<FileTypeIcon name={name}/>}</div><div data-folder><FolderTypeIcon/><FolderTypeIcon open/></div></IconPackProvider>};createRoot(document.getElementById('root')).render(<Fixture/>);`
  const bundle = await build({ input: 'virtual:bounded-icons.tsx', write: false, platform: 'browser', output: { format: 'esm', codeSplitting: startupCodeSplitting }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production') } }, plugins: [{ name: 'bounded-icons', resolveId(id) { if (id === 'virtual:bounded-icons.tsx') return id }, load(id) { if (id === 'virtual:bounded-icons.tsx') return source } }] })
  const chunks = bundle.output.filter(item => item.type === 'chunk')
  const modules = chunks.flatMap(chunk => Object.keys(chunk.modules))
  assert.equal(modules.includes(`${root}src/utils/file-icon-artwork.json`), false, 'Material full-pack source cannot enter the product graph')
  assert.equal(modules.includes(`${root}src/utils/catppuccin-icon-artwork.json`), false, 'Catppuccin full-pack source cannot enter the product graph')
  const artwork = chunks.filter(chunk => Object.keys(chunk.modules).some(id => /\/file-icon-chunks\/[^/]+\.json$/.test(id)))
  for (const chunk of artwork) {
    assert.equal(Object.keys(chunk.modules).filter(id => /\/file-icon-chunks\/[^/]+\.json$/.test(id)).length, 1, chunk.fileName)
    assert.ok(Buffer.byteLength(chunk.code) <= 48 * 1024, `${chunk.fileName}: emitted chunk must remain bounded`)
  }
  const owners = new Map(chunks.flatMap(chunk => Object.keys(chunk.modules).map(id => [id, '/' + chunk.fileName] as const)))
  const registry = async (pack: string) => JSON.parse((await fs.readFile(`${root}src/utils/file-icon-chunks/${pack}.ts`, 'utf8')).match(/^export const iconChunks:.* = (.+)$/m)![1]) as Record<string, number>
  const [material, catppuccin] = await Promise.all([registry('material'), registry('catppuccin')])
  const bucket = (pack: string, number: number) => owners.get(`${root}src/utils/file-icon-chunks/${pack}-${String(number).padStart(2, '0')}.json`)!
  return { scripts: new Map(chunks.map(chunk => ['/' + chunk.fileName, chunk.code])), entry: '/' + chunks.find(chunk => chunk.isEntry)!.fileName, artwork: new Set(artwork.map(chunk => '/' + chunk.fileName)), material, catppuccin, bucket }
}

test('cold file icons download only selected bounded buckets and ignore cancelled pack loads', { skip: !domBrowserExecutable(), timeout: 25_000 }, async t => {
  const fixture = await fixtureBundle(), browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  t.after(() => browser.close())
  const page = await browser.newPage(), errors: string[] = [], requested: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.setDefaultTimeout(5000)
  const materialTypescript = fixture.bucket('material', fixture.material.typescript)
  const catppuccinTypescript = fixture.bucket('catppuccin', fixture.catppuccin['mocha-typescript'])
  const held = new Set([materialTypescript, catppuccinTypescript]), releases = new Map<string, () => void>()
  await page.route('http://bounded-icons.test/**', async route => {
    const path = new URL(route.request().url()).pathname
    requested.push(path)
    if (held.has(path)) await new Promise<void>(resolve => releases.set(path, resolve))
    if (page.isClosed()) return
    const script = fixture.scripts.get(path)
    await route.fulfill(script === undefined ? { contentType: 'text/html', body: `<div id="root"></div><script type="module" src="${fixture.entry}"></script>` } : { contentType: 'text/javascript', body: script })
  })
  await page.goto('http://bounded-icons.test/')
  await page.locator('[data-file] img[data-file-icon="file"]').waitFor()
  await page.locator('[data-folder] img[data-file-icon="folder-open"]').waitFor()
  assert.deepEqual(requested.filter(path => fixture.artwork.has(path)), [], 'generic files and folders never download associated artwork')
  const materialRequest = page.waitForRequest(request => new URL(request.url()).pathname === materialTypescript)
  await page.evaluate("window.setName('main.ts')")
  await materialRequest
  assert.equal(await page.locator('[data-file] img').getAttribute('data-file-icon'), 'file')
  assert.deepEqual(requested.filter(path => fixture.artwork.has(path)), [materialTypescript])
  const catppuccinRequest = page.waitForRequest(request => new URL(request.url()).pathname === catppuccinTypescript)
  await page.evaluate("window.setPack('catppuccin')")
  await catppuccinRequest
  await page.locator('[data-file] img[data-file-icon="mocha-_file"]').waitFor()
  assert.deepEqual(requested.filter(path => fixture.artwork.has(path)), [materialTypescript, catppuccinTypescript])
  await page.evaluate("window.setPack('none')")
  await page.locator('[data-file] svg').waitFor()
  for (const path of held) { held.delete(path); releases.get(path)!() }
  await page.getByRole('button', { name: 'Toggle', exact: true }).click()
  await page.getByRole('button', { name: 'Toggle', exact: true }).click()
  assert.equal(await page.locator('[data-file] img').count(), 0, 'cancelled pack responses cannot replace basic artwork')
  await page.evaluate("window.setPack('material')")
  await page.locator('[data-file] img[data-file-icon="typescript"]').waitFor()
  assert.equal(requested.filter(path => path === materialTypescript).length, 1, 'reopening shares the successful bucket request')
  await page.evaluate("window.setName('config.toml')")
  await page.locator('[data-file] img[data-file-icon="toml_light"]').waitFor()
  const original = JSON.parse(await fs.readFile(new URL('../utils/file-icon-artwork.json', import.meta.url), 'utf8')) as Record<string, string>
  for (const id of ['toml', 'toml_light']) {
    const image = page.locator(`[data-file] img[data-file-icon="${id}"]`)
    assert.equal(decodeURIComponent((await image.getAttribute('src'))!.split(',').slice(1).join(',')), original[id], id)
    assert.equal(await image.getAttribute('alt'), '')
    assert.equal(await image.getAttribute('draggable'), 'false')
    assert.equal(await image.getAttribute('width'), '16')
  }
  await page.evaluate("window.setPack('catppuccin');window.setName('main.ts')")
  for (const id of ['mocha-typescript', 'latte-typescript']) await page.locator(`[data-file] img[data-file-icon="${id}"]`).waitFor()
  const before = requested.filter(path => fixture.artwork.has(path)).length
  await page.evaluate("window.setName('unknown.xyz')")
  await page.locator('[data-file] img[data-file-icon="mocha-_file"]').waitFor()
  assert.equal(requested.filter(path => fixture.artwork.has(path)).length, before)
  const expected = new Set([materialTypescript, catppuccinTypescript, fixture.bucket('material', fixture.material.toml)])
  assert.deepEqual(new Set(requested.filter(path => fixture.artwork.has(path))), expected, 'no unrelated icon bucket or full pack is downloaded')
  assert.deepEqual(errors, [])
  await page.close()
})
