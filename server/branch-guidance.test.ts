import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR } from './dataDir.ts'
import { AGENT_GUIDANCE_PATH, GuidanceError, agentGuidanceSettings, readAgentGuidance, updateAgentGuidance } from './agent-guidance.ts'
import { agentContextText } from './agent-context.ts'
import { runWithAgentAccount } from './agent-account-settings.ts'
import { gitWorkingGuidance, guidanceOptions } from '../shared/agent-guidance.ts'

const start = '<!-- mew:agent-setting:branch -->'
const end = '<!-- /mew:agent-setting:branch -->'
const block = (text: string) => `${start}\n${text}\n${end}`

function assertMainGuidance(content: string) {
  assert.equal(content.split(gitWorkingGuidance).length - 1, 1)
  assert.doesNotMatch(content, /mew:agent-setting:branch|mew:branch-guidance|Retired automation/)
  assert.match(content, /Use the repository’s main branch in its existing working folder/)
  assert.match(content, /Do not create task branches or Git worktrees, or perform automatic merges/)
  assert.match(content, /Preserve all existing staged, unstaged, and untracked work/)
  assert.match(content, /do not push unless the user requests it/)
}

test('new and empty accounts use main without creating a guidance file or configurable strategy', () => {
  fs.rmSync(AGENT_GUIDANCE_PATH, { force: true })
  assertMainGuidance(readAgentGuidance())
  assert.equal(fs.existsSync(AGENT_GUIDANCE_PATH), false)
  const state = agentGuidanceSettings()
  assert.equal(Object.hasOwn(state, 'branch'), false)
  assert.doesNotMatch(state.content, /mew:agent-setting:branch|mew:branch-guidance/)
  fs.writeFileSync(AGENT_GUIDANCE_PATH, '')
  assertMainGuidance(readAgentGuidance())
  assert.equal(fs.readFileSync(AGENT_GUIDANCE_PATH, 'utf8'), '')
})

test('all retired versions and automation choices are omitted without changing stored instructions or commit preferences', () => {
  for (const version of [1, 2, 3]) {
    for (const strategy of ['github-flow', 'git-flow', 'trunk', 'inherit']) {
      for (const workflow of ['manual', 'local', 'remote']) {
        const legacy = block(`<!-- mew:branch-guidance:v${version} ${JSON.stringify({ strategy, workflow })} -->\nRetired automation: create a feature branch, worktree, merge, and push.`)
        const original = `Keep handwritten rules.\n${legacy}\n<!-- mew:agent-setting:commit -->\n${guidanceOptions.commit.requested}\n<!-- /mew:agent-setting:commit -->\nKeep trailing rules.\n`
        fs.writeFileSync(AGENT_GUIDANCE_PATH, original)
        const state = agentGuidanceSettings()
        const effective = readAgentGuidance()
        assertMainGuidance(effective)
        assert.ok(effective.includes(guidanceOptions.commit.requested))
        assert.match(effective, /Keep handwritten rules/)
        assert.match(effective, /Keep trailing rules/)
        assert.equal(fs.readFileSync(AGENT_GUIDANCE_PATH, 'utf8'), original)
        assert.equal(agentGuidanceSettings().revision, state.revision)
      }
    }
  }
})

test('custom retired branch sections stay in the source but no longer reach agents', () => {
  const legacy = block('Retired automation: always create a worktree for our team.')
  fs.writeFileSync(AGENT_GUIDANCE_PATH, `Keep this prose.\n${legacy}\n`)
  const before = agentGuidanceSettings()
  const after = updateAgentGuidance({ key: 'language', value: 'ko', revision: before.revision })
  assert.ok(after.content.includes(legacy))
  assert.ok(after.content.startsWith('Keep this prose.'))
  assertMainGuidance(readAgentGuidance())
  assert.match(readAgentGuidance(), /Respond to the user in Korean/)
})

test('retired branch API writes are rejected without modifying the source', () => {
  fs.writeFileSync(AGENT_GUIDANCE_PATH, 'Keep original.\n')
  const state = agentGuidanceSettings()
  assert.throws(() => updateAgentGuidance({ key: 'branch', value: { strategy: 'git-flow' }, revision: state.revision }), (error: unknown) => error instanceof GuidanceError && error.status === 400)
  assert.equal(fs.readFileSync(AGENT_GUIDANCE_PATH, 'utf8'), state.content)
})

test('damaged or overlapping retired sections block delivery and writes instead of consuming other settings', () => {
  const languageStart = '<!-- mew:agent-setting:language -->'
  const languageEnd = '<!-- /mew:agent-setting:language -->'
  for (const damaged of [start, end, `${end}${start}`, `${block('old')}\n${block('old')}`, `${start}${languageStart}Keep this.${end}${languageEnd}`, `${languageStart}${block('old')}${languageEnd}`, `${start}${languageStart}Keep this.${languageEnd}${end}`]) {
    fs.writeFileSync(AGENT_GUIDANCE_PATH, damaged)
    const state = agentGuidanceSettings()
    assert.throws(() => readAgentGuidance(), (error: unknown) => error instanceof GuidanceError && error.status === 409)
    assert.throws(() => updateAgentGuidance({ key: 'detail', value: 'detailed', revision: state.revision }), (error: unknown) => error instanceof GuidanceError && error.status === 409)
    assert.equal(fs.readFileSync(AGENT_GUIDANCE_PATH, 'utf8'), damaged)
  }
})

test('legacy TXT preview receives the same main guidance without rewriting or creating Markdown', () => {
  fs.rmSync(AGENT_GUIDANCE_PATH, { force: true })
  const legacy = path.join(DATA_DIR, 'agent-guidance.txt')
  const original = `Keep legacy text.\n${block('Retired automation: create a branch.')}\n`
  fs.writeFileSync(legacy, original)
  try {
    assertMainGuidance(readAgentGuidance())
    assert.equal(fs.existsSync(AGENT_GUIDANCE_PATH), false)
    assert.equal(fs.readFileSync(legacy, 'utf8'), original)
  } finally { fs.rmSync(legacy, { force: true }) }
})

test('different account strategies produce the same main workflow in project context and preserve account settings', () => {
  const root = path.join(DATA_DIR, 'single-main-project')
  fs.mkdirSync(root, { recursive: true })
  for (const [account, language, commit] of [['alice@example.test', 'ko', 'always'], ['bob@example.test', 'en', 'requested']] as const) {
    runWithAgentAccount(account, () => {
      let state = agentGuidanceSettings()
      fs.writeFileSync(state.path, `Keep ${account} instructions.\n${block('Retired automation: account-specific branches.')}\n`)
      state = agentGuidanceSettings()
      state = updateAgentGuidance({ key: 'language', value: language, revision: state.revision })
      state = updateAgentGuidance({ key: 'commit', value: commit, revision: state.revision })
      const context = agentContextText({ projectRoot: root, docsRoot: path.join(root, 'docs') }, root)
      assertMainGuidance(context)
      assert.ok(context.includes(guidanceOptions.language[language]))
      assert.ok(context.includes(guidanceOptions.commit[commit]))
      assert.equal(fs.readFileSync(state.path, 'utf8'), state.content)
    })
  }
})
