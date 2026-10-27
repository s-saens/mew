import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { collectSources, GRAPHIFY_VERSION, indexProject, isSourceFile, queryProject, readCurrent } from './graphify.mjs'

const installedPython = fileURLToPath(new URL(process.platform === 'win32'
  ? '../.data/graphify/venv/Scripts/python.exe' : '../.data/graphify/venv/bin/python', import.meta.url))

function write(root, file, content) {
  const destination = path.join(root, file)
  mkdirSync(path.dirname(destination), { recursive: true })
  writeFileSync(destination, content)
}

function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout
}

function repository(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'mew-graphify-test-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  git(root, 'init', '--quiet')
  write(root, '.gitignore', '.data/\nsrc/ignored.ts\n')
  return root
}

test('source selection includes application code and resolution config, excluding non-source trees', () => {
  for (const file of ['src/search.ts', 'server/search.ts', 'packages/core/index.tsx', 'apps/cli/main.mjs', 'tools/check.py', 'native/core/main.rs', 'package.json', 'tsconfig.app.json', 'src/tsconfig.json']) {
    assert.equal(isSourceFile(file), true, file)
  }
  for (const file of ['.data/session.ts', '.worktrees/copy/src/main.ts', 'docs/example.ts', 'src/search.test.ts', 'server/search.spec.ts', 'src/__tests__/search.ts', 'src/fixtures/example.ts', 'native/vendor/lib.c', 'native/core/target/main.rs', 'src/node_modules/lib.js', 'src/dist/app.js', 'src/dist-demo/app.js', 'other/project.ts', 'src/image.png']) {
    assert.equal(isSourceFile(file), false, file)
  }
})

test('Git source discovery includes untracked working code and rejects ignored data, examples, and symlinks', (t) => {
  const root = repository(t)
  write(root, 'src/tracked.ts', 'export const tracked = 1\n')
  git(root, 'add', 'src/tracked.ts')
  write(root, 'server/new.ts', 'export const untracked = 2\n')
  write(root, 'src/ignored.ts', 'export const ignored = 3\n')
  write(root, '.data/session.ts', 'export const privateData = 4\n')
  // Tracked paths still need the wrapper filter; Git's ignore rules alone do not remove them.
  git(root, 'add', '--force', '.data/session.ts')
  for (const file of ['docs/example.ts', 'src/search.test.ts', 'src/fixtures/example.ts', 'native/vendor/lib.c']) {
    write(root, file, 'export const excluded = 5\n')
  }
  symlinkSync(path.join(root, 'src/tracked.ts'), path.join(root, 'src/linked.ts'))
  symlinkSync(path.join(root, 'src'), path.join(root, 'server/linked-dir'))

  const sources = collectSources(root)
  assert.deepEqual(sources.files.map((file) => file.path), ['server/new.ts', 'src/tracked.ts'])
  assert.equal(sources.files[0].content.toString(), 'export const untracked = 2\n')
})

test('fingerprints follow current contents, additions, and tracked deletions while ignoring docs and tests', (t) => {
  const root = repository(t)
  write(root, 'src/value.ts', 'export const value = 1\n')
  git(root, 'add', 'src/value.ts')
  const initial = collectSources(root).fingerprint
  assert.equal(collectSources(root).fingerprint, initial)

  write(root, 'docs/example.ts', 'export const example = 9\n')
  write(root, 'src/value.test.ts', 'export const testOnly = 9\n')
  write(root, '.data/session.ts', 'export const privateData = 9\n')
  assert.equal(collectSources(root).fingerprint, initial)

  write(root, 'src/value.ts', 'export const value = 2\n')
  const modified = collectSources(root).fingerprint
  assert.notEqual(modified, initial)
  write(root, 'src/new.ts', 'export const added = 3\n')
  const added = collectSources(root).fingerprint
  assert.notEqual(added, modified)
  unlinkSync(path.join(root, 'src/value.ts'))
  const deleted = collectSources(root)
  assert.notEqual(deleted.fingerprint, added)
  assert.deepEqual(deleted.files.map((file) => file.path), ['src/new.ts'])
})

test('real Graphify indexes and queries code, refuses stale results, and preserves the current graph on failure', {
  skip: existsSync(installedPython) ? false : `Graphify integration requires the installed Python at ${installedPython}; run node tools/graphify.mjs setup.`,
}, (t) => {
  const root = repository(t)
  const previousOut = process.env.GRAPHIFY_OUT
  process.env.GRAPHIFY_OUT = path.join(root, 'unrelated-output')
  t.after(() => {
    if (previousOut === undefined) delete process.env.GRAPHIFY_OUT
    else process.env.GRAPHIFY_OUT = previousOut
  })
  write(root, 'src/helper.ts', 'export function normalizeName(name: string) { return name.trim() }\n')
  write(root, 'src/main.ts', 'import { normalizeName } from "./helper"\nexport function greet(name: string) { return normalizeName(name) }\n')

  const indexed = indexProject(root, installedPython)
  assert.equal(indexed.version, GRAPHIFY_VERSION)
  assert.equal(indexed.files, 2)
  assert.ok(indexed.nodes > 0)
  assert.ok(indexed.edges > 0)
  assert.equal(existsSync(path.join(root, 'unrelated-output')), false)
  const graphBefore = readFileSync(indexed.graph, 'utf8')
  const pointer = path.join(root, '.data/graphify/current.json')
  const pointerBefore = readFileSync(pointer, 'utf8')
  const graph = JSON.parse(graphBefore)
  assert.ok(graph.nodes.some((node) => node.source_file === 'src/helper.ts'))
  assert.match(queryProject(root, 'query', ['normalizeName'], installedPython), /normalizeName/)
  assert.match(queryProject(root, 'explain', ['normalizeName'], installedPython), /helper\.ts/)
  assert.match(queryProject(root, 'path', ['greet', 'normalizeName'], installedPython), /normalizeName/)
  assert.match(queryProject(root, 'affected', ['normalizeName'], installedPython), /greet/)
  assert.throws(() => queryProject(root, 'explain', ['missingSymbol'], installedPython),
    (error) => error.exitCode === 4 && /no (?:node|match)/i.test(error.message))

  // An unchanged run must return the existing graph without even invoking the supplied executable.
  assert.equal(indexProject(root, path.join(root, 'missing-python')).generation, indexed.generation)
  write(root, 'src/helper.ts', 'export function normalizeName(name: string) { return name.trim().toLowerCase() }\n')
  assert.throws(() => queryProject(root, 'query', ['normalizeName'], installedPython), /graph is stale/)
  assert.throws(() => indexProject(root, path.join(root, 'missing-python')), /ENOENT/)
  assert.equal(readFileSync(pointer, 'utf8'), pointerBefore)
  assert.equal(readFileSync(indexed.graph, 'utf8'), graphBefore)
  assert.equal(readCurrent(root).generation, indexed.generation)
  assert.deepEqual(readdirSync(path.join(root, '.data/graphify')).filter((name) => name.startsWith('index-')), [indexed.generation])

  // index must recover an old-version or malformed pointer, as its error guidance promises.
  writeFileSync(pointer, '{invalid json')
  const refreshed = indexProject(root, installedPython)
  assert.notEqual(refreshed.generation, indexed.generation)
  assert.notEqual(refreshed.fingerprint, indexed.fingerprint)
  assert.match(queryProject(root, 'query', ['normalizeName'], installedPython), /normalizeName/)
})
