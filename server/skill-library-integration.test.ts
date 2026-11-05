import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { skillLibrary } from './skill-library.ts'
import { listSkills } from './skills.ts'
import { describeAgentContext } from './project-context-text.ts'
import { defaultAgentSettings } from './project-agent-settings.ts'
import { activeCommitSkill } from './active-commit-skill.ts'
import { agentGuidanceSettings, updateAgentGuidance } from './agent-guidance.ts'

test('one enablement policy governs suggestions, documentation routing, and optional commit instructions', t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-library-integration-'))
  fs.mkdirSync(path.join(cwd, '.git'))
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }))
  const guidance = agentGuidanceSettings()
  updateAgentGuidance({ key: 'language', value: 'en', revision: guidance.revision })
  const binding = { projectRoot: cwd, docsRoot: path.join(cwd, 'docs') }
  const context = () => describeAgentContext(binding, defaultAgentSettings(), cwd)
  const row = (name: string) => skillLibrary.list(cwd).items.find(item => item.name === name)!
  const documentation = row('english-technical-docs')
  assert.ok(context().includes(`$${documentation.name}`))
  skillLibrary.mutate({ cwd, action: 'toggle', id: documentation.id, revision: documentation.revision, scope: 'project', enabled: false })
  assert.equal(listSkills(cwd).some(item => item.name === documentation.name), false)
  assert.equal(context().includes(`$${documentation.name}`), false)
  assert.equal(context().includes('For technical documentation tasks'), false)
  const disabled = row(documentation.name)
  skillLibrary.mutate({ cwd, action: 'reset', id: disabled.id, revision: disabled.revision, scope: 'project' })
  assert.ok(context().includes(`$${documentation.name}`))

  const commit = row('commit')
  const original = activeCommitSkill(cwd)
  assert.ok(original.path)
  assert.ok(context().includes('Mew commit skill:'))
  skillLibrary.mutate({ cwd, action: 'toggle', id: commit.id, revision: commit.revision, scope: 'project', enabled: false })
  assert.equal(listSkills(cwd).some(item => item.name === 'commit'), false)
  assert.equal(context().includes('Mew commit skill:'), false)
  const fallback = activeCommitSkill(cwd)
  assert.equal(fallback.path, '')
  assert.doesNotMatch(fallback.content, /writing-clearly|proofread|language-specific/)
  assert.match(fallback.content, /commits.*skipped/)
  const off = row('commit')
  skillLibrary.mutate({ cwd, action: 'reset', id: off.id, revision: off.revision, scope: 'project' })
  assert.deepEqual(activeCommitSkill(cwd), original)
})
