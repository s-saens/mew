import './test-isolated-data.ts'
import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DATA_DIR } from './dataDir.ts'
import { listCatalogChildren, listCatalogFiles, readyFileCatalog, resetFileCatalogs } from './fileCatalog.ts'
import { readIgnoreList, writeIgnoreList } from './ignoreList.ts'
import { createProjectPathResolver, pathsForWorkspace, resolveProjectPath, workspaceContext } from './paths.ts'
import { createPathVisibility, isPathVisible } from './tree.ts'

function fixture(t: TestContext, files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-catalog-visibility-'))
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, 'sample', rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
  }
  t.after(() => {
    resetFileCatalogs()
    fs.rmSync(root, { recursive: true, force: true })
  })
  return root
}

test('warm catalog prepares root and missing ignore policy once while checking every target', async t => {
  const files = Object.fromEntries(Array.from({ length: 64 }, (_, i) => [`f${i}.ts`, 'export {}']))
  const root = fixture(t, files)
  await workspaceContext.run(pathsForWorkspace(root, null), async () => {
    await readyFileCatalog('sample')
    const stats = t.mock.method(fs, 'statSync')
    const realpaths = t.mock.method(fs, 'realpathSync')
    const reads = t.mock.method(fs, 'readFileSync')
    const listed = await listCatalogFiles('sample')
    assert.equal(listed.length, 64)
    assert.ok(stats.mock.calls.filter(call => call.arguments[0] === path.join(root, 'sample')).length <= 2,
      'catalog lookup and visibility preparation each validate the root once')
    assert.ok(realpaths.mock.calls.filter(call => call.arguments[0] === path.resolve(DATA_DIR)).length <= 3,
      'the canonical server-data boundary is prepared a constant number of times')
    assert.equal(reads.mock.calls.filter(call => call.arguments[0] === path.join(DATA_DIR, 'ignore.json')).length, 1,
      'a missing ignore file is read once for the whole batch')
    for (const rel of Object.keys(files)) {
      assert.equal(realpaths.mock.calls.filter(call => call.arguments[0] === path.join(root, 'sample', rel)).length, 1,
        `${rel} still has its current canonical target checked`)
    }
  })
})

test('catalog filtering refreshes ignore policy between listings and keeps role-specific views separate', async t => {
  const root = fixture(t, { 'private/hidden.ts': 'export {}', 'visible.ts': 'export {}', 'extra.zip': 'zip' })
  const previous = [...readIgnoreList()]
  t.after(() => writeIgnoreList(previous))
  await workspaceContext.run(pathsForWorkspace(root, null), async () => {
    const snapshot = await readyFileCatalog('sample')
    writeIgnoreList([...previous, 'private'])
    assert.deepEqual((await listCatalogFiles('sample')).map(file => file.path), ['visible.ts'])
    assert.deepEqual((await listCatalogFiles('sample', { showAll: true })).map(file => file.path).sort(),
      ['extra.zip', 'private/hidden.ts', 'visible.ts'])
    writeIgnoreList(previous.filter(name => name !== 'private'))
    assert.deepEqual((await listCatalogFiles('sample')).map(file => file.path).sort(), ['private/hidden.ts', 'visible.ts'])
    assert.equal(await readyFileCatalog('sample'), snapshot, 'policy changes do not require rebuilding the catalog')
  })
})

test('prepared visibility and warm catalog reject a directory replaced by a server-data symlink', async t => {
  const name = `catalog-visibility-${process.pid}.ts`
  const root = fixture(t, { [`public/${name}`]: 'public', 'visible.ts': 'export {}' })
  const serverFile = path.join(DATA_DIR, name)
  fs.writeFileSync(serverFile, 'synthetic private data')
  t.after(() => fs.rmSync(serverFile, { force: true }))
  await workspaceContext.run(pathsForWorkspace(root, null), async () => {
    await readyFileCatalog('sample')
    const visible = createPathVisibility('sample', { showAll: true })
    assert.equal(visible(`public/${name}`, 'file'), true)
    const publicDirectory = path.join(root, 'sample', 'public')
    fs.renameSync(publicDirectory, path.join(root, 'saved-public'))
    fs.symlinkSync(DATA_DIR, publicDirectory, process.platform === 'win32' ? 'junction' : 'dir')
    assert.equal(visible(`public/${name}`, 'file'), false, 'even a prepared batch checks the new canonical target')
    assert.equal(visible('public/new.ts', 'file'), false, 'a missing suffix under server data is also blocked')
    assert.deepEqual((await listCatalogFiles('sample', { showAll: true })).map(file => file.path), ['visible.ts'])
    assert.deepEqual((await listCatalogChildren('sample', '', { showAll: true })).entries.map(file => file.path), ['visible.ts'])
  })
})

test('batch resolver preserves scalar path validation and unknown-project visibility rules', t => {
  const root = fixture(t, { 'src/main.ts': 'export {}' })
  workspaceContext.run(pathsForWorkspace(root, null), () => {
    const resolve = createProjectPathResolver('sample')
    for (const relative of ['src/main.ts', '/src/main.ts', 'new/missing.ts', '../escape.ts', '.git/config', 'src/../../escape.ts', 'node_modules/a.ts', '.data/a.ts']) {
      try {
        const expected = resolveProjectPath('sample', relative)
        assert.equal(resolve(relative), expected)
      } catch (error) {
        assert.throws(() => resolve(relative), { name: (error as Error).name, message: (error as Error).message })
      }
    }
    const visible = createPathVisibility('not-created')
    for (const relative of ['src/main.ts', 'archive.zip', '.git/config', 'dist/main.js', 'build/main.js', '.worktrees/task/main.ts', '']) {
      assert.equal(visible(relative), isPathVisible('not-created', relative))
    }
    assert.equal(visible('src/main.ts'), true)
    assert.equal(visible('archive.zip'), false)
    assert.equal(visible('.git/config'), false)
    assert.equal(visible('dist/main.js'), false)
    assert.equal(visible('build/main.js'), false)
    assert.equal(visible('.worktrees/task/main.ts'), false)
    if (process.platform === 'win32') {
      for (const relative of ['CON', 'src/file.ts:stream', 'src/trailing.']) {
        assert.throws(() => resolve(relative))
      }
    }
  })
})

test('simultaneous account workspace contexts keep identically named catalogs separate', async t => {
  const first = fixture(t, { 'first.ts': 'first' })
  const second = fixture(t, { 'second.ts': 'second' })
  const results = await Promise.all([
    workspaceContext.run(pathsForWorkspace(first, 'first@example.test'), async () => {
      await readyFileCatalog('sample')
      return (await listCatalogFiles('sample')).map(file => file.path)
    }),
    workspaceContext.run(pathsForWorkspace(second, 'second@example.test'), async () => {
      await readyFileCatalog('sample')
      return (await listCatalogFiles('sample')).map(file => file.path)
    }),
  ])
  assert.deepEqual(results, [['first.ts'], ['second.ts']])
})
