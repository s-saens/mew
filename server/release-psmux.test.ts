import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { encodeWindowsRuntimeLinks, crateSources, selectedLicense, reviewedLicense } from './release-psmux.ts'

test('psmux dependency provenance requires a registry checksum and refuses unexpected sources', () => {
  const checksum = 'a'.repeat(64)
  const lock = `[[package]]\nname="psmux"\nversion="3.4.0"\n[[package]]\nname="fixture"\nversion="1.2.3"\nsource="registry+https://github.com/rust-lang/crates.io-index"\nchecksum="${checksum}"`
  assert.deepEqual(crateSources(lock), [{ name: 'fixture', version: '1.2.3', checksum, url: 'https://static.crates.io/crates/fixture/fixture-1.2.3.crate' }])
  assert.throws(() => crateSources(lock.replace(checksum, 'bad')), /Unreviewed/)
  assert.throws(() => crateSources(lock.replace('registry+https://github.com/rust-lang/crates.io-index', 'git+https://example.test/repo')), /Unreviewed/)
})

test('license review chooses a permissive OR branch and preserves every AND obligation', () => {
  assert.equal(selectedLicense('MIT OR Apache-2.0 OR LGPL-2.1-or-later'), 'MIT')
  assert.equal(selectedLicense('(MIT OR Apache-2.0) AND Unicode-3.0'), 'MIT AND Unicode-3.0')
  assert.equal(selectedLicense('Apache-2.0/MIT'), 'Apache-2.0')
  assert.ok(reviewedLicense('Apache-2.0 WITH LLVM-exception OR MIT'))
  for (const license of ['', 'GPL-3.0-only', 'MIT AND MPL-2.0', 'MIT WITH Unknown', 'MIT OR', '(MIT', 'LicenseRef-Unknown']) assert.equal(reviewedLicense(license), false)
})

test('Windows workspace junctions encode correctly through an alias of the staging directory', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-runtime-junctions-'))
  t.after(() => fs.rm(temp, { recursive: true, force: true }))
  const root = path.join(temp, 'runtime')
  const alias = path.join(temp, 'alias')
  const scoped = path.join(root, 'node_modules', '@mew')
  const editor = path.join(root, 'packages', 'editor')
  await fs.mkdir(scoped, { recursive: true })
  await fs.mkdir(editor, { recursive: true })
  await fs.symlink(root, alias, 'junction')
  await fs.symlink(editor, path.join(scoped, 'editor'), 'junction')
  await encodeWindowsRuntimeLinks(alias)
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'runtime-links.json'), 'utf8')), [
    { path: 'node_modules/@mew/editor', target: '../../packages/editor' },
  ])
  assert.deepEqual(await fs.readdir(scoped), [])
  await fs.symlink(temp, path.join(scoped, 'outside'), 'junction')
  await assert.rejects(encodeWindowsRuntimeLinks(alias), /Unexpected Windows workspace link/)
})
