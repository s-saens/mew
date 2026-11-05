import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { SkillLibraryError, SkillLibraryStore, skillProjectRoot } from './skill-library.ts'

function skill(name: string, body = 'Skill instructions'): string {
  return `---\nname: ${name}\ndescription: "Instructions for ${name}"\n---\n\n${body}\n`
}

function fixture(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-skill-library-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const home = path.join(root, 'home'), cwd = path.join(root, 'project'), libraryDir = path.join(root, 'library')
  fs.mkdirSync(home); fs.mkdirSync(path.join(cwd, '.git'), { recursive: true })
  const environment = { home, env: {}, libraryDir }
  const store = new SkillLibraryStore(environment)
  const write = (file: string, content: string) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content) }
  const item = (name: string) => {
    const found = store.list(cwd).items.find(item => item.name === name)
    assert.ok(found, `Missing skill ${name}`)
    return found
  }
  return { root, home, cwd, libraryDir, store, write, item, environment }
}

test('initial defaults contain only five entrypoints and discovery does not write files', t => {
  const { store, cwd, libraryDir } = fixture(t)
  const list = store.list(cwd)
  assert.deepEqual(list.items.map(item => item.name), ['chinese-technical-docs', 'commit', 'english-technical-docs', 'japanese-technical-docs', 'korean-technical-docs'])
  assert.equal(list.candidates.length, 0)
  assert.equal(list.items.every(item => item.enabled && item.source === 'builtin'), true)
  assert.equal(fs.existsSync(libraryDir), false)
  assert.equal(fs.existsSync(path.join(cwd, '.mew')), false)
  assert.equal(store.resolve(cwd).some(item => item.name === 'writing-clearly-and-concisely'), false)
})

test('common and project registrations resolve once and persist project enable overrides', t => {
  const { store, cwd, item, environment } = fixture(t)
  store.mutate({ cwd, action: 'create', scope: 'common', name: 'sample', content: skill('sample', 'Common') })
  let current = item('sample')
  store.mutate({ cwd, action: 'toggle', id: current.id, revision: current.revision, scope: 'common', enabled: false })
  current = item('sample')
  assert.equal(current.enabled, false)
  store.mutate({ cwd, action: 'toggle', id: current.id, revision: current.revision, scope: 'project', enabled: true })
  current = item('sample')
  assert.equal(current.enabled, true)
  assert.equal(current.commonEnabled, false)
  assert.equal(current.enabledScope, 'project')
  assert.equal(new SkillLibraryStore(environment).resolve(cwd).some(item => item.name === 'sample'), true)
  store.mutate({ cwd, action: 'reset', id: current.id, revision: current.revision, scope: 'project' })
  assert.equal(item('sample').enabled, false)
  store.mutate({ cwd, action: 'create', scope: 'project', name: 'sample', content: skill('sample', 'Project') })
  assert.equal(store.list(cwd).items.filter(item => item.name === 'sample').length, 1)
  assert.equal(item('sample').scope, 'project')
  assert.equal(item('sample').overridesCommon, true)
  assert.match(store.detail(cwd, item('sample').id).content, /Project/)
})

test('deleting a project override prevents silent common fallback', t => {
  const { store, cwd, item, environment } = fixture(t)
  store.mutate({ cwd, action: 'create', scope: 'common', name: 'sample', content: skill('sample') })
  store.mutate({ cwd, action: 'create', scope: 'project', name: 'sample', content: skill('sample') })
  const current = item('sample')
  store.mutate({ cwd, action: 'delete', id: current.id, revision: current.revision })
  const fallback = item('sample')
  assert.equal(fallback.scope, 'common')
  assert.equal(fallback.enabled, false)
  assert.equal(fallback.enabledScope, 'project')
  assert.deepEqual(new SkillLibraryStore(environment).policy(cwd).disabledNames, ['sample'])
  assert.equal(store.resolve(cwd).some(item => item.name === 'sample'), false)
})

test('provenance includes common overrides and the bundled base exactly once', t => {
  const { store, cwd, libraryDir, item, write } = fixture(t)
  const packaged = item('commit').path
  const common = path.join(libraryDir, 'commit/SKILL.md')
  write(common, skill('commit', 'Common override'))
  assert.deepEqual(item('commit').origins.map(origin => origin.path), [common, packaged])
  store.mutate({ cwd, action: 'create', scope: 'project', name: 'commit', content: skill('commit', 'Project override') })
  const project = path.join(cwd, '.mew/skills/commit/SKILL.md')
  assert.deepEqual(item('commit').origins.map(origin => origin.path), [project, common, packaged])
  assert.equal(new Set(item('commit').origins.map(origin => origin.id)).size, 3)
})

test('removed defaults remain absent until explicitly restored', t => {
  const { store, cwd, item, environment } = fixture(t)
  for (const name of ['english-technical-docs', 'commit']) {
    const current = item(name)
    store.mutate({ cwd, action: 'delete', id: current.id, revision: current.revision })
  }
  const reloaded = new SkillLibraryStore(environment)
  for (let i = 0; i < 3; i++) {
    assert.equal(reloaded.list(cwd).items.some(item => ['english-technical-docs', 'commit'].includes(item.name)), false)
    assert.equal(reloaded.resolve(cwd).some(item => item.name === 'commit'), false)
  }
  assert.deepEqual(reloaded.policy(cwd).disabledNames, ['commit', 'english-technical-docs'])
  reloaded.mutate({ cwd, action: 'restore', name: 'commit' })
  assert.equal(reloaded.resolve(cwd).some(item => item.name === 'commit'), true)
  assert.equal(reloaded.resolve(cwd).some(item => item.name === 'english-technical-docs'), false)
  assert.throws(() => reloaded.mutate({ cwd, action: 'restore', name: 'commit' }), error => error instanceof SkillLibraryError && error.status === 409)
})

test('existing commit content stays editable and deletion does not recreate its directory', t => {
  const { store, cwd, libraryDir, write, item } = fixture(t)
  const file = path.join(libraryDir, 'commit/SKILL.md')
  write(file, skill('commit', 'User content'))
  let current = item('commit')
  assert.equal(current.source, 'builtin')
  assert.equal(current.path, file)
  store.mutate({ cwd, action: 'save', id: current.id, revision: current.revision, content: skill('commit', 'Updated content') })
  assert.match(fs.readFileSync(file, 'utf8'), /Updated content/)
  current = item('commit')
  store.mutate({ cwd, action: 'delete', id: current.id, revision: current.revision })
  store.list(cwd); store.resolve(cwd); store.policy(cwd)
  assert.equal(fs.existsSync(path.dirname(file)), false)
})

test('external discovery is bounded to the selected project and imports all assets without changing sources', t => {
  const { store, root, home, cwd, write, item } = fixture(t)
  const source = path.join(home, '.agents/skills/sample')
  write(path.join(source, 'SKILL.md'), skill('sample'))
  write(path.join(source, 'scripts/run.ts'), 'export const value = 42')
  write(path.join(source, 'assets/icon.bin'), 'asset')
  write(path.join(cwd, 'child/.git/HEAD'), 'ref: main')
  write(path.join(cwd, 'child/.agents/skills/child-skill/SKILL.md'), skill('child-skill'))
  write(path.join(root, 'sibling/.agents/skills/sibling-skill/SKILL.md'), skill('sibling-skill'))
  const list = store.list(cwd)
  assert.deepEqual(list.candidates.map(item => item.name), ['sample'])
  assert.equal(store.resolve(cwd).some(item => item.name === 'sample'), false)
  const candidate = list.candidates[0]
  assert.equal(store.detail(cwd, candidate.id).candidate?.name, 'sample')
  store.mutate({ cwd, action: 'import', scope: 'common', id: candidate.id, revision: candidate.revision })
  const detail = store.detail(cwd, item('sample').id)
  assert.deepEqual(detail.files, ['assets/icon.bin', 'scripts/run.ts', 'SKILL.md'])
  assert.equal(fs.readFileSync(path.join(source, 'scripts/run.ts'), 'utf8'), 'export const value = 42')
  assert.equal(fs.readFileSync(path.join(path.dirname(item('sample').path), 'assets/icon.bin'), 'utf8'), 'asset')
  assert.equal(item('sample').origins.length, 2)
})

test('stale file and asset revisions reject save, toggle, delete, and import', t => {
  const { store, cwd, home, write, item } = fixture(t)
  store.mutate({ cwd, action: 'create', scope: 'common', name: 'sample', content: skill('sample') })
  const old = item('sample')
  write(path.join(path.dirname(old.path), 'asset.txt'), 'new asset')
  for (const action of ['save', 'toggle', 'delete'] as const) {
    assert.throws(() => store.mutate({ cwd, action, id: old.id, revision: old.revision, enabled: false, content: skill('sample') }), error => error instanceof SkillLibraryError && error.status === 409)
  }
  const source = path.join(home, '.agents/skills/external')
  write(path.join(source, 'SKILL.md'), skill('external'))
  const candidate = store.list(cwd).candidates[0]
  write(path.join(source, 'asset.txt'), 'changed')
  assert.throws(() => store.mutate({ cwd, action: 'import', scope: 'project', id: candidate.id, revision: candidate.revision }), error => error instanceof SkillLibraryError && error.status === 409)
})

test('imports reject symlink assets and managed destinations reject symlink ancestors', t => {
  const { store, root, cwd, home, libraryDir, write } = fixture(t)
  const source = path.join(home, '.agents/skills/external')
  write(path.join(source, 'SKILL.md'), skill('external'))
  write(path.join(root, 'outside.txt'), 'private')
  fs.symlinkSync(path.join(root, 'outside.txt'), path.join(source, 'link.txt'))
  const candidate = store.list(cwd).candidates[0]
  assert.equal(candidate.importable, false)
  assert.throws(() => store.mutate({ cwd, action: 'import', scope: 'common', id: candidate.id, revision: candidate.revision }), /심볼릭 링크/)
  assert.equal(fs.existsSync(libraryDir), false)
  const outside = path.join(root, 'outside-library')
  fs.mkdirSync(outside)
  fs.symlinkSync(outside, libraryDir)
  assert.throws(() => store.mutate({ cwd, action: 'create', scope: 'common', name: 'sample', content: skill('sample') }), /심볼릭 링크/)
  assert.deepEqual(fs.readdirSync(outside), [])
})

test('create rejects traversal, duplicate names, and mismatched metadata', t => {
  const { store, cwd, write, libraryDir } = fixture(t)
  assert.throws(() => store.mutate({ cwd, action: 'create', scope: 'common', name: '../escape', content: skill('escape') }))
  assert.throws(() => store.mutate({ cwd, action: 'create', scope: 'common', name: 'sample', content: skill('other') }), /name/)
  store.mutate({ cwd, action: 'create', scope: 'common', name: 'sample', content: skill('sample') })
  assert.throws(() => store.mutate({ cwd, action: 'create', scope: 'common', name: 'sample', content: skill('sample') }), error => error instanceof SkillLibraryError && error.status === 409)
  write(path.join(libraryDir, 'collision/SKILL.md'), skill('sample', 'Spoofed name'))
  assert.equal(store.list(cwd).items.filter(item => item.name === 'sample').length, 1)
  assert.equal(store.list(cwd).warnings.some(warning => warning.includes('collision')), true)
})

test('runtime resolution skips external catalogs and asset snapshot failures', t => {
  const { store, cwd, home, write, item } = fixture(t)
  store.mutate({ cwd, action: 'create', scope: 'common', name: 'sample', content: skill('sample') })
  const asset = path.join(path.dirname(item('sample').path), 'asset')
  fs.mkdirSync(asset)
  // The full inventory rejects more than 2,000 files, but per-turn resolution only reads metadata.
  for (let i = 0; i < 2001; i++) fs.writeFileSync(path.join(asset, String(i)), '')
  write(path.join(home, '.agents/skills/external/SKILL.md'), skill('external'))
  assert.equal(store.list(cwd).items.some(item => item.name === 'sample'), false)
  assert.equal(store.resolve(cwd).some(item => item.name === 'sample'), true)
  assert.deepEqual(store.policy(cwd).excludedPaths, [])
  assert.equal(store.policy(cwd, { native: true }).excludedPaths.length, 1)
})

test('project boundary selects nearest Git or Mew root without walking descendants', t => {
  const { root, cwd, write } = fixture(t)
  const directory = path.join(cwd, 'src/nested')
  fs.mkdirSync(directory, { recursive: true })
  assert.equal(skillProjectRoot(directory), cwd)
  write(path.join(cwd, '.mew/settings.json'), '{}')
  const nested = path.join(cwd, 'nested-project')
  fs.mkdirSync(path.join(nested, '.git'), { recursive: true })
  assert.equal(skillProjectRoot(nested), nested)
  const unmarked = path.join(root, 'unmarked')
  fs.mkdirSync(unmarked)
  assert.equal(skillProjectRoot(unmarked), unmarked)
})
