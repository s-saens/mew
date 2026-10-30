import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { generateManifest } from 'material-icon-theme'
import { fileIconId, folderIconId } from './file-icons.ts'
import manifest from './file-icon-manifest.json' with { type: 'json' }
import defaultArtwork from './file-icon-default-artwork.json' with { type: 'json' }

test('file icons distinguish languages, documents, media, archives and special filenames', () => {
  for (const [name, icon] of Object.entries({
    'main.ts': 'typescript', 'component.tsx': 'react_ts', 'index.js': 'javascript',
    'main.py': 'python', 'main.rs': 'rust', 'style.css': 'css',
    'note.md': 'markdown', 'notes.txt': 'document', 'report.pdf': 'pdf',
    'photo.png': 'image', 'song.mp3': 'audio', 'movie.mp4': 'video', 'archive.zip': 'zip',
    'package.json': 'nodejs', Dockerfile: 'docker', LICENSE: 'license', '.env': 'tune',
    'README.md': 'readme',
  })) assert.equal(fileIconId(name), icon, name)
})

test('file icons match basename and longest compound extensions without case sensitivity', () => {
  assert.equal(fileIconId('/project/src/MAIN.TEST.TS'), 'test-ts')
  assert.equal(fileIconId('C:\\project\\TYPES.D.TS'), 'typescript-def')
  assert.equal(fileIconId('/project/PACKAGE.JSON'), 'nodejs')
  assert.equal(fileIconId('/project/.CONFIG/graphqlrc'), 'graphql')
  assert.equal(fileIconId('archive.tar.gz'), 'zip')
  for (const name of ['mew', '/project/mew', 'no-extension', 'file.unknown-extension', 'constructor', '__proto__', 'x.constructor', '']) {
    assert.equal(fileIconId(name), 'file', name)
  }
})

test('generic files and both folder states use the pinned pack artwork without lazy loading', async () => {
  const upstream = generateManifest()
  assert.equal(folderIconId(), upstream.folder)
  assert.equal(folderIconId(true), upstream.folderExpanded)
  assert.equal(manifest.file, upstream.file)
  assert.deepEqual(Object.keys(defaultArtwork).sort(), [upstream.file, upstream.folder, upstream.folderExpanded].sort())
  for (const [id, svg] of Object.entries(defaultArtwork)) {
    assert.equal(svg, await fs.readFile(path.resolve('node_modules/material-icon-theme/dist', upstream.iconDefinitions[id].iconPath), 'utf8'), id)
  }
})

test('light theme associations override only the matching filename or extension', () => {
  assert.equal(fileIconId('config.toml'), 'toml')
  assert.equal(fileIconId('config.toml', true), 'toml_light')
  assert.equal(fileIconId('next.config.ts'), 'next')
  assert.equal(fileIconId('next.config.ts', true), 'next_light')
  assert.equal(fileIconId('main.ts', true), 'typescript')
})

test('generated maps cover the pinned upstream pack and every selected SVG exists', async () => {
  const upstream = generateManifest()
  const normalize = (table: Record<string, string>) => Object.fromEntries(Object.entries(table).map(([key, value]) => [key.toLowerCase(), value]))
  assert.deepEqual(manifest.fileNames, normalize(upstream.fileNames))
  assert.deepEqual(manifest.fileExtensions, normalize(upstream.fileExtensions))
  assert.deepEqual(manifest.light.fileNames, normalize(upstream.light.fileNames))
  assert.deepEqual(manifest.light.fileExtensions, normalize(upstream.light.fileExtensions))
  const ids = new Set([manifest.file])
  for (const theme of [manifest, manifest.light]) {
    for (const [name, id] of Object.entries(theme.fileNames)) {
      assert.equal(fileIconId(name, theme === manifest.light), id, name)
      ids.add(id)
    }
    for (const id of Object.values(theme.fileExtensions)) ids.add(id)
  }
  for (const id of ids) {
    const svg = await fs.readFile(path.resolve('node_modules/material-icon-theme/dist', upstream.iconDefinitions[id].iconPath), 'utf8')
    assert.match(svg, /<svg\b/)
  }
})
