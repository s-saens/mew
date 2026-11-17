import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import { build } from 'vite'
import { uiCompressionPlugin } from './ui-compression-plugin.ts'

test('production UI compression emits exact Brotli/gzip sidecars after generated CSS and skips tiny/binary assets', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mew-ui-compression-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await Promise.all([
    writeFile(path.join(root, 'main.js'), 'export const load = () => import("./feature.js"); export const value = ' + JSON.stringify('번역 日本語 UTF-8 '.repeat(1000))),
    writeFile(path.join(root, 'feature.js'), 'import "./feature.css"; export const value = ' + JSON.stringify('A deferred feature '.repeat(1000))),
    writeFile(path.join(root, 'feature.css'), '.feature { color: red; }\n'.repeat(100)),
  ])
  const result = await build({
    configFile: false, root, publicDir: false, logLevel: 'silent',
    build: { outDir: path.join(root, 'dist'), minify: false, rolldownOptions: { input: path.join(root, 'main.js'), preserveEntrySignatures: 'strict' } },
    plugins: [uiCompressionPlugin(), { name: 'generated-assets', generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'assets/theme-hash.css', source: '.class { color: red; }\n'.repeat(200) })
      this.emitFile({ type: 'asset', fileName: 'assets/tiny-hash.js', source: 'console.log("tiny")' })
      this.emitFile({ type: 'asset', fileName: 'assets/image-hash.png', source: new Uint8Array(5000) })
      this.emitFile({ type: 'asset', fileName: 'other/private.js', source: 'private'.repeat(1000) })
    } }],
  })
  assert.ok(!Array.isArray(result) && 'output' in result)
  const bytes = (filename: string) => readFile(path.join(root, 'dist', filename))
  for (const item of result.output.filter(item => /^assets\/.*\.(?:js|css)$/.test(item.fileName) && item.fileName !== 'assets/tiny-hash.js')) {
    assert.deepEqual(brotliDecompressSync(await bytes(item.fileName + '.br')), await bytes(item.fileName))
    assert.deepEqual(gunzipSync(await bytes(item.fileName + '.gz')), await bytes(item.fileName))
  }
  const entry = result.output.find(item => item.type === 'chunk' && item.isEntry)!
  const entrySource = (await bytes(entry.fileName)).toString()
  assert.match(entrySource, /__vitePreload|__vite__mapDeps/, 'exercise the final Vite preload rewrite')
  assert.doesNotMatch(entrySource, /__VITE_PRELOAD__/)
  const files = await readdir(path.join(root, 'dist/assets'))
  for (const name of ['assets/tiny-hash.js', 'assets/image-hash.png', 'other/private.js']) {
    assert.equal(files.includes(path.basename(name) + '.br') || files.includes(path.basename(name) + '.gz'), false, name)
  }
})
