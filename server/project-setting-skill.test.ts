import './test-isolated-data.ts'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { SkillLibraryStore } from './skill-library.ts'
import { listSkills } from './skills.ts'

const name = 'mew-project-setting'

function fixture(t: test.TestContext) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-project-setting-skill-'))
  const cwd = path.join(directory, 'project'), home = path.join(directory, 'home')
  fs.mkdirSync(path.join(cwd, '.git'), { recursive: true }); fs.mkdirSync(home)
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const environment = { home, env: {}, runtimeEnvs: {}, libraryDir: path.join(directory, 'library') }
  const store = new SkillLibraryStore(environment)
  const row = () => {
    const item = store.list(cwd).items.find(item => item.name === name)
    assert.ok(item, 'Mew project setting must be registered as a default skill')
    return item
  }
  return { cwd, home, store, row, environment }
}

test('project setting is an enabled bundled skill available to every runtime without native installation', t => {
  const { cwd, home, store, row } = fixture(t)
  const item = row()
  assert.equal(item.source, 'builtin')
  assert.equal(item.enabled, true)
  assert.equal(item.editable, false)
  assert.ok(store.detail(cwd, item.id).files.includes('agents/openai.yaml'))
  for (const runtime of ['codex', 'claude', 'hermes', 'cursor', 'prime', 'opencode', 'openclaw', 'antigravity', 'kimi']) {
    const matches = listSkills(cwd, runtime, home, {}).filter(skill => skill.name === name)
    assert.equal(matches.length, 1, runtime)
    assert.equal(matches[0].path, item.path)
  }
  assert.equal(fs.existsSync(path.join(home, '.codex')), false)
  assert.equal(fs.existsSync(path.join(cwd, '.mew')), false)
})

test('project setting respects persistent disable, removal, restoration, and project customization', t => {
  const { cwd, store, row, environment } = fixture(t)
  let item = row()
  store.mutate({ cwd, action: 'toggle', id: item.id, revision: item.revision, scope: 'project', enabled: false })
  assert.equal(new SkillLibraryStore(environment).resolve(cwd).some(skill => skill.name === name), false)
  item = row()
  store.mutate({ cwd, action: 'reset', id: item.id, revision: item.revision, scope: 'project' })
  item = row()
  store.mutate({ cwd, action: 'delete', id: item.id, revision: item.revision })
  const reloaded = new SkillLibraryStore(environment)
  assert.equal(reloaded.resolve(cwd).some(skill => skill.name === name), false)
  assert.ok(reloaded.policy(cwd).disabledNames.includes(name))
  assert.equal(reloaded.list(cwd).defaults.find(skill => skill.name === name)?.installed, false)
  reloaded.mutate({ cwd, action: 'restore', name })
  assert.equal(reloaded.resolve(cwd).some(skill => skill.name === name), true)
  const content = `---\nname: ${name}\ndescription: Project-specific setup\n---\nKeep this project's existing test workflow.\n`
  reloaded.mutate({ cwd, action: 'create', scope: 'project', name, content })
  const override = new SkillLibraryStore(environment).resolve(cwd).find(skill => skill.name === name)!
  assert.equal(override.scope, 'project')
  assert.equal(override.editable, true)
  assert.equal(reloaded.detail(cwd, override.id).content, content)
})

test('project setting covers project actions, Mew documentation, test-first development, and overridable defaults', t => {
  const { store, cwd, row } = fixture(t)
  const content = store.detail(cwd, row().id).content
  assert.match(content, /\.mew\/project-actions\.json/)
  assert.match(content, /debug.*release/i)
  assert.match(content, /automation/i)
  assert.match(content, /agent/i)
  assert.match(content, /notification/i)
  assert.match(content, /Browser/)
  assert.match(content, /APK/)
  assert.match(content, /must not block project creation or editing/)
  assert.match(content, /concept.*feature specification/i)
  assert.match(content, /description/)
  assert.match(content, /test-driven development \(TDD\)/)
  assert.match(content, /before implementation/i)
  assert.match(content, /changing a feature.*update.*tests/s)
  assert.match(content, /user instructions or other skills can replace/i)
  assert.match(content, /execution restrictions/)
})
