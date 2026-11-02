import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse } from 'yaml'
import { execFileSync } from 'node:child_process'

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-registry-'))
process.env.MEW_DATA_DIR = path.join(temporary, 'server-data')
const { ProjectRegistry, ProjectRegistryError } = await import('./project-registry.ts')
const { DataFileError } = await import('./dataDir.ts')
const { pathsForWorkspace, workspaceContext, ensureDocsRoot } = await import('./paths.ts')
let sequence = 0
function fixture() {
  const directory = path.join(temporary, `fixture-${sequence++}`)
  const store = new ProjectRegistry(path.join(directory, 'data'), path.join(directory, 'projects'))
  fs.mkdirSync(path.dirname(store.file), { recursive: true })
  return store
}
after(() => fs.rmSync(temporary, { recursive: true, force: true }))

test('fresh installations have no projects or implicit default root', () => {
  const store = fixture()
  assert.deepEqual(store.list('new@example.test'), [])
  assert.equal(store.readMine('new@example.test'), null)
})

test('migrates every account shortcut and active legacy root into the shared YAML ledger', () => {
  const store = fixture(), first = path.join(temporary, 'legacy-a'), second = path.join(temporary, 'legacy-b')
  const legacy = {
    'A@Example.Test': { rootProjects: { paths: [first], icons: { [first]: '🌱' }, groups: [] } },
    'b@example.test': { rootProjects: { paths: [second, first], icons: {} } },
    'c@example.test': { activeWorkspace: second },
    'd@example.test': { theme: {} },
  }
  const file = path.join(path.dirname(store.file), 'user-ui-state.json')
  fs.writeFileSync(file, JSON.stringify(legacy))
  assert.deepEqual(store.list('a@example.test').map(project => [project.path, project.mine]), [[first, true], [second, false]])
  assert.deepEqual(store.readMine('b@example.test')?.paths, [second, first])
  assert.deepEqual(store.readMine('c@example.test')?.paths, [second])
  assert.equal(store.readMine('d@example.test'), null)
  assert.deepEqual(store.readMine('a@example.test')?.icons, { [first]: '🌱' })
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), legacy, 'migration preserves the source ledger')
  fs.writeFileSync(file, '{}')
  assert.deepEqual(store.readMine('a@example.test')?.paths, [first], 'subsequent reads use YAML')
})

test('creation uses only the name and defaults to an initialized Git repository', async () => {
  const store = fixture()
  const created = await store.create('A@example.test', '새 프로젝트')
  assert.equal(created.path, path.join(store.managedRoot, '새 프로젝트'))
  assert.deepEqual(fs.readdirSync(created.path).sort(), ['.git', '.gitignore', '.mew'])
  assert.equal(pathsForWorkspace(created.path, 'a@example.test').docsDir, '.mew/docs')
  workspaceContext.run(pathsForWorkspace(created.path, 'a@example.test'), () => ensureDocsRoot())
  assert.deepEqual(fs.readdirSync(created.path).sort(), ['.git', '.gitignore', '.mew'], 'opening Documents keeps the empty project root unchanged')
  assert.equal(fs.readFileSync(path.join(created.path, '.gitignore'), 'utf8'), '.mew/temp/\n')
  assert.equal(created.managed, true)
  assert.equal(store.list('a@example.test')[0].mine, true)
  assert.equal(store.list('b@example.test')[0].mine, false)
  await assert.rejects(store.create('b@example.test', '새 프로젝트'), error => error instanceof ProjectRegistryError && error.status === 409)
  assert.equal(store.list('b@example.test')[0].mine, false)
})

test('Git can be disabled and invalid names cannot escape the managed root', async () => {
  const store = fixture()
  const created = await store.create('a@example.test', 'plain', false)
  assert.deepEqual(fs.readdirSync(created.path), ['.mew'])
  for (const name of ['', '..', '../escape', '/absolute', 'nested/path', 'nested\\path', '.hidden', ' bad', 'bad.', 'CON', 'a\0b']) {
    await assert.rejects(store.create('a@example.test', name), ProjectRegistryError)
  }
  await assert.rejects(store.create('a@example.test', 'wrong-git', 'yes'), ProjectRegistryError)
  assert.equal(store.list('a@example.test').length, 1)
})

test('linking canonicalizes paths and My Projects changes preserve the global catalog and other accounts', () => {
  const store = fixture(), external = path.join(temporary, `external-${sequence}`), alias = `${external}-alias`
  fs.mkdirSync(external)
  fs.symlinkSync(external, alias, 'dir')
  const linked = store.link('a@example.test', external)
  assert.equal(linked.managed, false)
  assert.equal(store.link('b@example.test', alias).path, external)
  assert.equal(store.list('a@example.test').length, 1)
  store.setMine('a@example.test', external, false)
  assert.deepEqual(store.readMine('a@example.test')?.paths, [])
  assert.deepEqual(store.readMine('b@example.test')?.paths, [external])
  assert.equal(store.list('a@example.test')[0].mine, false)
  store.setMine('a@example.test', external, true)
  assert.equal(store.list('a@example.test')[0].mine, true)
  assert.throws(() => store.link('a@example.test', path.join(external, 'missing')), ProjectRegistryError)
  assert.throws(() => store.link('a@example.test', process.env.MEW_DATA_DIR!), /서버 데이터/)
  assert.throws(() => store.setMine('a@example.test', '/unregistered', true), ProjectRegistryError)
  const yaml = parse(fs.readFileSync(store.file, 'utf8'))
  assert.equal(yaml.projects.length, 1)
  assert.deepEqual(yaml.myProjects['a@example.test'].paths, [external])
})

test('corrupt YAML and schema are never overwritten by mutations or project creation', async () => {
  const store = fixture()
  for (const raw of ['projects: [', 'version: 1\nprojects: []\nmyProjects: []\n', 'version: 1\nprojects: []\nmyProjects:\n  user:\n    paths: wrong\n    icons: {}\n']) {
    fs.writeFileSync(store.file, raw)
    assert.throws(() => store.list('a@example.test'), DataFileError)
    await assert.rejects(store.create('a@example.test', 'untouched'), DataFileError)
    assert.equal(fs.readFileSync(store.file, 'utf8'), raw)
    assert.equal(fs.existsSync(path.join(store.managedRoot, 'untouched')), false)
  }
})


test('managed content remains accessible when server metadata uses ~/.mew, while metadata and symlink escapes stay private', () => {
  const home = path.join(temporary, 'home'), serverData = path.join(home, '.mew')
  const script = `
    import fs from 'node:fs';
    import path from 'node:path';
    import assert from 'node:assert/strict';
    const { projectRegistry } = await import(${JSON.stringify(new URL('./project-registry.ts', import.meta.url).href)});
    const { assertNotServerDataPath, createProjectPathResolver, pathsForWorkspace, workspaceContext } = await import(${JSON.stringify(new URL('./paths.ts', import.meta.url).href)});
    const project = await projectRegistry.create('user@example.test', 'safe', false);
    assertNotServerDataPath(project.path);
    const secret = path.join(process.env.MEW_DATA_DIR, 'users.json');
    fs.writeFileSync(secret, '{}');
    assert.throws(() => assertNotServerDataPath(secret));
    fs.symlinkSync(secret, path.join(project.path, 'escape.json'));
    workspaceContext.run(pathsForWorkspace(project.path, 'user@example.test'), () => {
      const resolve = createProjectPathResolver('.workspace');
      assert.equal(resolve('README.md'), path.join(project.path, 'README.md'));
      assert.throws(() => resolve('escape.json'));
    });
  `
  execFileSync(process.execPath, ['--input-type=module', '--eval', script], { env: { ...process.env, HOME: home, MEW_DATA_DIR: serverData }, encoding: 'utf8' })
})
