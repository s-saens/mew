import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { prepareDesktopTestDependencies } from './desktop-test-dependencies.mjs'

test('desktop tests install only the root-lockfile YAML entry with integrity and no lifecycle scripts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-desktop-deps-test-'))
  const yaml = { version: '2.9.1', resolved: 'https://registry.npmjs.org/yaml/-/yaml-2.9.1.tgz', integrity: 'sha512-fixture' }
  const original = JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/yaml': yaml, 'node_modules/unrelated': { version: '1.0.0' } } })
  let temporary
  try {
    await fs.writeFile(path.join(root, 'package-lock.json'), original)
    await prepareDesktopTestDependencies({ root, run(command, args) {
      assert.equal(command, process.execPath)
      assert.ok(args.includes('--ignore-scripts'))
      temporary = args[args.indexOf('--prefix') + 1]
      const lock = JSON.parse(readFileSync(path.join(temporary, 'package-lock.json'), 'utf8'))
      assert.deepEqual(lock.packages['node_modules/yaml'], yaml)
      assert.deepEqual(Object.keys(lock.packages), ['', 'node_modules/yaml'])
      mkdirSync(path.join(temporary, 'node_modules/yaml'), { recursive: true })
      writeFileSync(path.join(temporary, 'node_modules/yaml/package.json'), '{"version":"2.9.1"}')
      return { status: 0 }
    } })
    assert.equal(JSON.parse(await fs.readFile(path.join(root, 'node_modules/yaml/package.json'), 'utf8')).version, yaml.version)
    assert.equal(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8'), original)
    await assert.rejects(fs.stat(temporary), { code: 'ENOENT' })
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test('missing integrity, future transitive dependencies, and npm failure cannot prepare test dependencies', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-desktop-deps-test-'))
  try {
    const yaml = { version: '2.9.1', resolved: 'https://example.test/yaml.tgz', integrity: 'sha512-fixture' }
    for (const entry of [{ ...yaml, integrity: undefined }, { ...yaml, dependencies: { extra: '1.0.0' } }, { ...yaml, optionalDependencies: { extra: '1.0.0' } }]) {
      await fs.writeFile(path.join(root, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/yaml': entry } }))
      await assert.rejects(prepareDesktopTestDependencies({ root, run() { assert.fail('Invalid lock metadata must not invoke npm') } }), /integrity|transitive/)
    }
    await fs.writeFile(path.join(root, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/yaml': yaml } }))
    let temporary
    await assert.rejects(prepareDesktopTestDependencies({ root, run(_command, args) {
      temporary = args[args.indexOf('--prefix') + 1]
      return { status: 1 }
    } }), /installation failed/)
    await assert.rejects(fs.stat(temporary), { code: 'ENOENT' })
    await assert.rejects(fs.stat(path.join(root, 'node_modules/yaml')), { code: 'ENOENT' })
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})
