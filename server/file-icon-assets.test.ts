import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const read = (file: string) => fs.readFile(path.join(root, file), 'utf8')
const json = async (file: string) => JSON.parse(await read(file))
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

test('Material artwork retains the pack license and supplemental source notices', async () => {
  const license = await read('public/licenses/material-icon-theme.txt')
  assert.match(license, /Copyright \(c\) 2025 Material Extensions/)
  assert.match(license, /The above copyright notice and this permission notice shall be included/)
  const notices = await read('public/licenses/material-icon-theme-notices.txt')
  assert.match(notices, /Pictogrammers Free License/)
  assert.match(notices, /Material Symbols/)
  assert.match(notices, /Apache License[\s\S]*Version 2\.0, January 2004/)
  assert.match(notices, /END OF TERMS AND CONDITIONS/)
  assert.match(notices, /Brand \/ Logos/)
})

test('curated Catppuccin assets retain pinned GitHub provenance, hashes and complete MIT notices', async () => {
  const source = await json('src/utils/catppuccin-icon-source.json')
  assert.equal(source.repository, 'https://github.com/catppuccin/vscode-icons')
  assert.equal(source.version, '1.26.0')
  assert.equal(source.commit, 'b6915da9f6889b683a110aa747de96c2820a537d')
  assert.equal(source.sha256, '57566136d0a8ba8d040eb6e5be866c88ccbb04f3d219d3a7e52a19978900ff3d')
  assert.equal(source.license, 'MIT')
  assert.match(source.archive, /^https:\/\/github\.com\/catppuccin\/vscode-icons\/releases\/download\/v1\.26\.0\//)
  const license = await read(source.licenseFile)
  assert.match(license, /^MIT License\n\nCopyright \(c\) 2023 Catppuccin\nCopyright \(c\) 2023 thang-nm\n/)
  assert.match(license, /The above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software\./)
  assert.match(license, /THE SOFTWARE IS PROVIDED "AS IS"/)
  for (const [file, expected] of Object.entries(source.generated)) assert.equal(sha256(await read(file)), expected, file)
  execFileSync(process.execPath, ['tools/generate-catppuccin-file-icons.mjs', '--check'], { cwd: root })
})

test('Catppuccin preserves complete filename, compound extension and named-folder associations for both palettes', async () => {
  const manifest = await json('src/utils/catppuccin-icon-manifest.json')
  const artwork = await json('src/utils/catppuccin-icon-artwork.json')
  const defaults = await json('src/utils/catppuccin-icon-default-artwork.json')
  for (const [theme, prefix] of [[manifest, 'mocha-'], [manifest.light, 'latte-']] as const) {
    assert.equal(Object.keys(theme.fileNames).length, 1084)
    assert.equal(Object.keys(theme.fileExtensions).length, 729)
    assert.equal(Object.keys(theme.folderNames).length, 421)
    assert.equal(Object.keys(theme.folderNamesExpanded).length, 421)
    assert.equal(theme.fileNames['readme.md'], `${prefix}readme`)
    assert.equal(theme.fileExtensions.ts, `${prefix}typescript`)
    assert.equal(theme.fileExtensions['test.ts'], `${prefix}typescript-test`)
    assert.equal(theme.folderNames.src, `${prefix}folder_src`)
    assert.equal(theme.file, `${prefix}_file`)
    assert.equal(theme.folder, `${prefix}_folder`)
    assert.equal(theme.folderExpanded, `${prefix}_folder_open`)
    for (const kind of ['fileNames', 'fileExtensions', 'folderNames', 'folderNamesExpanded']) {
      for (const [name, id] of Object.entries(theme[kind])) {
        assert.equal(name, name.toLowerCase())
        assert.equal(typeof id, 'string')
        assert.match(artwork[id as string], /^<svg\b/, `${kind}: ${name}`)
      }
    }
    for (const id of [theme.file, theme.folder, theme.folderExpanded]) assert.equal(defaults[id], artwork[id])
  }
  assert.equal(Object.keys(defaults).length, 6)
  assert.equal(Object.keys(artwork).length, 1236)
  assert.notEqual(defaults[manifest.file], defaults[manifest.light.file])
  for (const svg of Object.values(artwork) as string[]) {
    assert.doesNotMatch(svg, /<script\b|<foreignObject\b|\bon\w+\s*=|(?:href|src)\s*=/i)
    for (const [, value] of svg.matchAll(/url\s*\(([^)]*)\)/gi)) assert.match(value.trim(), /^['"]?#[\w-]+['"]?$/)
  }
})

test('Catppuccin regeneration rejects an unverified archive before extraction', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-icon-source-test-'))
  try {
    const archive = path.join(temporary, 'invalid.vsix')
    await fs.writeFile(archive, 'untrusted archive')
    const result = spawnSync(process.execPath, ['tools/generate-catppuccin-file-icons.mjs', '--check', '--source', archive], { cwd: root, encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Catppuccin archive SHA-256 mismatch/)
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
