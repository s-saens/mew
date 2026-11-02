import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

const root = new URL('../', import.meta.url)

test('offline icon chunks preserve every original SVG within a deterministic 32KiB bound', async () => {
  execFileSync(process.execPath, ['tools/generate-file-icon-chunks.mjs', '--check'], { cwd: root })
  for (const [pack, source] of [['material', 'file'], ['catppuccin', 'catppuccin']]) {
    const original = JSON.parse(await fs.readFile(new URL(`src/utils/${source}-icon-artwork.json`, root), 'utf8')) as Record<string, string>
    const registry = await fs.readFile(new URL(`src/utils/file-icon-chunks/${pack}.ts`, root), 'utf8')
    const index = JSON.parse(registry.match(/^export const iconChunks:.* = (.+)$/m)![1]) as Record<string, number>
    const files = [...registry.matchAll(/import\('\.\/(.+\.json)'\)/g)].map(match => match[1])
    const combined: Record<string, string> = {}
    assert.ok(files.length > 1)
    for (const [number, file] of files.entries()) {
      const content = await fs.readFile(new URL(`src/utils/file-icon-chunks/${file}`, root))
      assert.ok(content.byteLength <= 32 * 1024, `${file}: ${content.byteLength}`)
      const entries = JSON.parse(content.toString()) as Record<string, string>
      for (const [id, svg] of Object.entries(entries)) {
        assert.equal(Object.hasOwn(combined, id), false, `duplicate ${pack}/${id}`)
        assert.equal(index[id], number, `${pack}/${id}`)
        assert.equal(svg, original[id], `${pack}/${id}`)
        combined[id] = svg
      }
    }
    assert.deepEqual(combined, original, `${pack}: complete original artwork coverage`)
    assert.deepEqual(Object.keys(index).sort(), Object.keys(original).sort())
    for (const id of Object.keys(original)) {
      if (pack === 'material' && id.endsWith('_light') && Object.hasOwn(original, id.slice(0, -6))) assert.equal(index[id], index[id.slice(0, -6)], id)
      if (pack === 'catppuccin' && id.startsWith('latte-')) assert.equal(index[id], index[id.replace(/^latte-/, 'mocha-')], id)
    }
  }
})
