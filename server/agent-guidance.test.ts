import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR } from './dataDir.ts'
import { AGENT_GUIDANCE_PATH, captureCommitLanguageSnapshot, ensureAgentGuidance, readAgentGuidance, readCommitLanguageGuidance, runWithCommitLanguageSnapshot } from './agent-guidance.ts'
import { agentContextText } from './agent-context.ts'
import { describeAgentContext } from './project-context-text.ts'
import { defaultAgentSettings, writeProjectAgentSettings } from './project-agent-settings.ts'
import { readExternalFile, writeExternalFile } from './fsBrowse.ts'
import { guidanceOptions } from '../shared/agent-guidance.ts'
import { runWithAgentAccount } from './agent-account-settings.ts'

test('shared guidance survives initialization and editor changes reach every project on the next request', () => {
  const a = path.join(DATA_DIR, 'a'), b = path.join(DATA_DIR, 'b')
  for (const root of [a, b]) fs.mkdirSync(root)
  const binding = (root: string) => ({ projectRoot: root, docsRoot: path.join(root, 'docs') })
  const preview = describeAgentContext(binding(a), defaultAgentSettings(), a)
  assert.match(preview, /You are working through mew/)
  assert.match(preview, /Do not announce skill use in opening or progress messages/)
  assert.match(preview, /사용된 스킬: <names>/)
  assert.match(preview, /Used skills: <names>/)
  assert.match(preview, /Omit this line when no skills were used/)
  assert.equal(preview.split('Do not announce skill use').length - 1, 1, 'the template and runtime default must not duplicate the policy')
  assert.match(preview, /Do not add source comments solely for commit summaries/)
  assert.match(preview, /git-change-intent-cli\.ts.*--cwd/)
  assert.match(preview, /JSON on stdin/)
  assert.equal(fs.existsSync(AGENT_GUIDANCE_PATH), false, 'preview must not initialize state')
  agentContextText(binding(a), a)
  assert.match(readExternalFile(AGENT_GUIDANCE_PATH).content, /You are working through mew/)

  writeExternalFile(AGENT_GUIDANCE_PATH, 'Shared edited guidance')
  ensureAgentGuidance()
  assert.ok(readAgentGuidance().startsWith('Shared edited guidance'), 'initialization preserves edits')
  assert.equal(fs.readFileSync(AGENT_GUIDANCE_PATH, 'utf8'), 'Shared edited guidance')
  writeProjectAgentSettings(a, { ...defaultAgentSettings(), instructions: 'Only project A' })
  for (const root of [a, b]) {
    const text = agentContextText(binding(root), root)
    assert.match(text, /Shared edited guidance/)
    assert.match(text, /Do not announce skill use in opening or progress messages/)
    assert.equal(text.split('Do not announce skill use').length - 1, 1)
    assert.ok(text.includes(`Project root: ${JSON.stringify(root)}`))
    assert.equal(text.includes('Only project A'), root === a)
    assert.ok(!text.includes('You are working through mew'))
  }
  writeExternalFile(AGENT_GUIDANCE_PATH, '')
  assert.ok(readAgentGuidance().includes(guidanceOptions.debugger.enabled))
  assert.match(readAgentGuidance(), /사용된 스킬: <names>/)
  assert.equal(fs.readFileSync(AGENT_GUIDANCE_PATH, 'utf8'), '')
  assert.match(agentContextText(binding(b), b), /Project root:/)
  fs.unlinkSync(AGENT_GUIDANCE_PATH)
  fs.mkdirSync(AGENT_GUIDANCE_PATH)
  assert.throws(() => agentContextText(binding(b), b), 'read errors must not silently substitute the template')
  writeProjectAgentSettings(b, { ...defaultAgentSettings(), enabled: false })
  assert.equal(agentContextText(binding(b), b), '', 'disabled guidance does not read the file')
  fs.rmdirSync(AGENT_GUIDANCE_PATH)
  ensureAgentGuidance()
  assert.match(readAgentGuidance(), /You are working through mew/)
})

test('legacy guidance migrates without changing its content, and Markdown takes precedence', () => {
  fs.rmSync(AGENT_GUIDANCE_PATH, { force: true })
  const legacy = path.join(DATA_DIR, 'agent-guidance.txt')
  fs.writeFileSync(legacy, 'My instructions\n\nKeep this formatting.\n')
  assert.ok(readAgentGuidance().startsWith('My instructions\n\nKeep this formatting.'))
  assert.equal(fs.existsSync(AGENT_GUIDANCE_PATH), false)
  ensureAgentGuidance()
  assert.equal(fs.readFileSync(AGENT_GUIDANCE_PATH, 'utf8'), fs.readFileSync(legacy, 'utf8'))
  fs.writeFileSync(AGENT_GUIDANCE_PATH, '')
  assert.ok(readAgentGuidance().includes(guidanceOptions.debugger.enabled))
  assert.equal(fs.readFileSync(AGENT_GUIDANCE_PATH, 'utf8'), '')
  ensureAgentGuidance()
  assert.ok(readAgentGuidance().includes(guidanceOptions.debugger.enabled))
  assert.equal(fs.readFileSync(AGENT_GUIDANCE_PATH, 'utf8'), '')
  fs.rmSync(legacy)
})

test('settings preserve handwritten instructions, parse editor changes and reject stale writes', async () => {
  const { agentGuidanceSettings, updateAgentGuidance, GuidanceError } = await import('./agent-guidance.ts')
  const original = '# My instructions\n\nDo not deploy.\n'
  fs.writeFileSync(AGENT_GUIDANCE_PATH, original)
  let state = agentGuidanceSettings()
  assert.equal(state.settings.language, 'inherit')
  const stale = state.revision
  state = updateAgentGuidance({ key: 'language', value: 'ko', revision: state.revision })
  assert.ok(state.content.startsWith(original))
  assert.match(readAgentGuidance(), /Respond to the user in Korean/)
  assert.throws(() => updateAgentGuidance({ key: 'commit', value: 'always', revision: stale }), GuidanceError)
  state = updateAgentGuidance({ key: 'commit', value: 'always', revision: state.revision })
  assert.equal(state.settings.language, 'ko')
  const custom = state.content.replace('Respond to the user in Korean.', 'Use the language chosen for each project.')
  writeExternalFile(AGENT_GUIDANCE_PATH, custom, state.content)
  assert.throws(() => writeExternalFile(AGENT_GUIDANCE_PATH, 'stale', state.content), GuidanceError)
  state = agentGuidanceSettings()
  assert.equal(state.settings.language, 'custom')
  state = updateAgentGuidance({ key: 'detail', value: 'concise', revision: state.revision })
  assert.match(state.content, /Use the language chosen for each project/)
  state = updateAgentGuidance({ key: 'commit', value: 'inherit', revision: state.revision })
  assert.equal(state.settings.commit, 'inherit')
  assert.doesNotMatch(state.content, /After each completed change/)
  assert.throws(() => updateAgentGuidance({ key: '__proto__', value: 'always', revision: state.revision }), GuidanceError)
  for (const broken of [
    '<!-- mew:agent-setting:language -->Missing end',
    '<!-- mew:agent-setting:language -->x<!-- /mew:agent-setting:language --><!-- mew:agent-setting:language -->y<!-- /mew:agent-setting:language -->',
    '<!-- mew:agent-setting:language --><!-- mew:agent-setting:commit -->x<!-- /mew:agent-setting:language --><!-- /mew:agent-setting:commit -->',
  ]) {
    fs.writeFileSync(AGENT_GUIDANCE_PATH, broken)
    state = agentGuidanceSettings()
    assert.throws(() => updateAgentGuidance({ key: 'detail', value: 'detailed', revision: state.revision }), GuidanceError)
    assert.equal(fs.readFileSync(AGENT_GUIDANCE_PATH, 'utf8'), broken)
  }
})

test('subagent preferences preserve other guidance and reach each project without runtime configuration changes', async () => {
  const { agentGuidanceSettings, updateAgentGuidance } = await import('./agent-guidance.ts')
  const original = '# Shared instructions\n\nKeep handwritten guidance.\n'
  fs.writeFileSync(AGENT_GUIDANCE_PATH, original)
  let state = agentGuidanceSettings()
  assert.equal(state.settings.subagents, 'inherit')
  assert.equal(state.content, original, 'existing guidance is not opted into delegation')
  state = updateAgentGuidance({ key: 'language', value: 'ko', revision: state.revision })
  for (const value of ['automatic', 'explicit', 'never'] as const) {
    state = updateAgentGuidance({ key: 'subagents', value, revision: state.revision })
    assert.equal(state.settings.subagents, value)
    assert.equal(state.settings.language, 'ko')
    assert.ok(state.content.startsWith(original))
    for (const name of ['subagent-a', 'subagent-b']) {
      const root = path.join(DATA_DIR, name)
      fs.mkdirSync(root, { recursive: true })
      const context = agentContextText({ projectRoot: root, docsRoot: path.join(root, 'docs') }, root)
      assert.ok(context.includes(guidanceOptions.subagents[value]))
      for (const other of ['automatic', 'explicit', 'never'] as const) {
        if (other !== value) assert.ok(!context.includes(guidanceOptions.subagents[other]))
      }
    }
  }
  const custom = state.content.replace(guidanceOptions.subagents.never, 'Delegate research only.')
  writeExternalFile(AGENT_GUIDANCE_PATH, custom, state.content)
  state = agentGuidanceSettings()
  assert.equal(state.settings.subagents, 'custom')
  state = updateAgentGuidance({ key: 'detail', value: 'concise', revision: state.revision })
  assert.match(state.content, /Delegate research only\./)
  state = updateAgentGuidance({ key: 'subagents', value: 'inherit', revision: state.revision })
  assert.equal(state.settings.subagents, 'inherit')
  assert.doesNotMatch(state.content, /mew:agent-setting:subagents|Delegate research only/)
  assert.equal(state.settings.language, 'ko')
})


test('description navigation replaces only former default guidance and does not inject legacy maps', () => {
  const stored = 'Use Documents entrypoints and maps to find only the current documents relevant to the task.\nUpdate map links for new or moved documents.\nKeep my custom rules and maps unchanged.\n'
  fs.writeFileSync(AGENT_GUIDANCE_PATH, stored)
  const root = path.join(DATA_DIR, 'description-project')
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true })
  fs.writeFileSync(path.join(root, 'docs/MOC.md'), '# Legacy map')
  fs.writeFileSync(path.join(root, 'docs/README.md'), '# Rules')
  const context = describeAgentContext({ projectRoot: root, docsRoot: path.join(root, 'docs') }, defaultAgentSettings(), root)
  assert.match(context, /frontmatter description fields/)
  assert.match(context, /no MOC update is required/)
  assert.match(context, /Keep my custom rules and maps unchanged/)
  assert.doesNotMatch(context, /docs\/MOC\.md/)
  assert.equal(fs.readFileSync(AGENT_GUIDANCE_PATH, 'utf8'), stored, 'runtime migration must not rewrite custom state')
  const explicit = describeAgentContext({ projectRoot: root, docsRoot: path.join(root, 'docs') }, { ...defaultAgentSettings(), entrypoints: ['docs/MOC.md'] }, root)
  assert.match(explicit, /Configured entrypoints[\s\S]*docs\/MOC\.md/, 'explicit project choices stay reportable')
})


test('debugger guidance defaults on without rewriting existing instructions and honors saved preferences', async () => {
  const { agentGuidanceSettings, updateAgentGuidance, GuidanceError } = await import('./agent-guidance.ts')
  fs.rmSync(AGENT_GUIDANCE_PATH, { force: true })
  assert.ok(readAgentGuidance().includes(guidanceOptions.debugger.enabled))
  assert.equal(fs.existsSync(AGENT_GUIDANCE_PATH), false, 'preview stays read-only')
  assert.equal(agentGuidanceSettings().settings.debugger, 'enabled')
  const original = '# Handwritten instructions\n\nKeep existing rules.\n'
  fs.writeFileSync(AGENT_GUIDANCE_PATH, original)
  let state = agentGuidanceSettings()
  assert.equal(state.settings.debugger, 'enabled')
  assert.equal(state.content, original)
  const roots = ['debugger-a', 'debugger-b'].map(name => path.join(DATA_DIR, name))
  const contexts = () => roots.map(root => {
    fs.mkdirSync(root, { recursive: true })
    return agentContextText({ projectRoot: root, docsRoot: path.join(root, 'docs') }, root)
  })
  for (const context of contexts()) assert.ok(context.includes(guidanceOptions.debugger.enabled))
  assert.equal(fs.readFileSync(AGENT_GUIDANCE_PATH, 'utf8'), original, 'defaults do not overwrite handwritten state')
  for (const value of ['disabled', 'enabled', 'disabled'] as const) {
    state = updateAgentGuidance({ key: 'debugger', value, revision: state.revision })
    assert.equal(state.settings.debugger, value)
    assert.ok(state.content.startsWith(original))
    for (const context of contexts()) {
      assert.ok(context.includes(guidanceOptions.debugger[value]))
      assert.ok(!context.includes(guidanceOptions.debugger[value === 'enabled' ? 'disabled' : 'enabled']))
    }
    ensureAgentGuidance()
    assert.equal(agentGuidanceSettings().settings.debugger, value)
  }
  state = updateAgentGuidance({ key: 'language', value: 'ko', revision: state.revision })
  assert.equal(state.settings.debugger, 'disabled', 'other settings cannot re-enable debugger use')
  const custom = state.content.replace(guidanceOptions.debugger.disabled, 'Use the debugger for integration failures only.')
  fs.writeFileSync(AGENT_GUIDANCE_PATH, custom)
  state = agentGuidanceSettings()
  assert.equal(state.settings.debugger, 'custom')
  assert.ok(!readAgentGuidance().includes(guidanceOptions.debugger.enabled))
  state = updateAgentGuidance({ key: 'detail', value: 'concise', revision: state.revision })
  assert.match(state.content, /Use the debugger for integration failures only/)
  assert.equal(state.settings.debugger, 'custom')
  for (const broken of [
    '<!-- mew:agent-setting:debugger -->Missing end',
    '<!-- /mew:agent-setting:debugger -->',
    '<!-- mew:agent-setting:debugger --><!-- mew:agent-setting:language -->x<!-- /mew:agent-setting:debugger --><!-- /mew:agent-setting:language -->',
  ]) {
    fs.writeFileSync(AGENT_GUIDANCE_PATH, broken)
    state = agentGuidanceSettings()
    assert.ok(!readAgentGuidance().includes(guidanceOptions.debugger.enabled))
    assert.throws(() => updateAgentGuidance({ key: 'debugger', value: 'enabled', revision: state.revision }), GuidanceError)
    assert.equal(fs.readFileSync(AGENT_GUIDANCE_PATH, 'utf8'), broken)
  }
})


test('test-writing guidance defaults to required without rewriting existing instructions and honors saved preferences', async () => {
  const { agentGuidanceSettings, updateAgentGuidance, GuidanceError } = await import('./agent-guidance.ts')
  fs.rmSync(AGENT_GUIDANCE_PATH, { force: true })
  assert.ok(readAgentGuidance().includes(guidanceOptions.testing.required))
  assert.equal(fs.existsSync(AGENT_GUIDANCE_PATH), false, 'preview stays read-only')
  assert.equal(agentGuidanceSettings().settings.testing, 'required')
  const original = '# Handwritten instructions\n\nKeep existing rules.\n'
  fs.writeFileSync(AGENT_GUIDANCE_PATH, original)
  let state = agentGuidanceSettings()
  assert.equal(state.settings.testing, 'required')
  assert.equal(state.content, original)
  const roots = ['testing-a', 'testing-b'].map(name => path.join(DATA_DIR, name))
  const contexts = () => roots.map(root => {
    fs.mkdirSync(root, { recursive: true })
    return agentContextText({ projectRoot: root, docsRoot: path.join(root, 'docs') }, root)
  })
  for (const context of contexts()) assert.ok(context.includes(guidanceOptions.testing.required))
  assert.equal(fs.readFileSync(AGENT_GUIDANCE_PATH, 'utf8'), original, 'defaults do not overwrite handwritten state')
  for (const value of ['project', 'required', 'project'] as const) {
    state = updateAgentGuidance({ key: 'testing', value, revision: state.revision })
    assert.equal(state.settings.testing, value)
    assert.ok(state.content.startsWith(original))
    for (const context of contexts()) {
      assert.ok(context.includes(guidanceOptions.testing[value]))
      assert.ok(!context.includes(guidanceOptions.testing[value === 'required' ? 'project' : 'required']))
    }
    ensureAgentGuidance()
    assert.equal(agentGuidanceSettings().settings.testing, value)
  }
  state = updateAgentGuidance({ key: 'language', value: 'ko', revision: state.revision })
  assert.equal(state.settings.testing, 'project', 'other settings cannot restore the test-writing requirement')
  const custom = state.content.replace(guidanceOptions.testing.project, 'Write tests for storage changes only.')
  fs.writeFileSync(AGENT_GUIDANCE_PATH, custom)
  state = agentGuidanceSettings()
  assert.equal(state.settings.testing, 'custom')
  assert.ok(!readAgentGuidance().includes(guidanceOptions.testing.required))
  state = updateAgentGuidance({ key: 'detail', value: 'concise', revision: state.revision })
  assert.match(state.content, /Write tests for storage changes only/)
  assert.equal(state.settings.testing, 'custom')
  for (const broken of [
    '<!-- mew:agent-setting:testing -->Missing end',
    '<!-- /mew:agent-setting:testing -->',
    '<!-- mew:agent-setting:testing --><!-- mew:agent-setting:language -->x<!-- /mew:agent-setting:testing --><!-- /mew:agent-setting:language -->',
  ]) {
    fs.writeFileSync(AGENT_GUIDANCE_PATH, broken)
    state = agentGuidanceSettings()
    assert.ok(!readAgentGuidance().includes(guidanceOptions.testing.required))
    assert.throws(() => updateAgentGuidance({ key: 'testing', value: 'required', revision: state.revision }), GuidanceError)
    assert.equal(fs.readFileSync(AGENT_GUIDANCE_PATH, 'utf8'), broken)
  }
})


test('mew response language follows each request locale without rewriting saved guidance', async () => {
  const { agentGuidanceSettings, updateAgentGuidance } = await import('./agent-guidance.ts')
  fs.writeFileSync(AGENT_GUIDANCE_PATH, '# Keep my rules\n')
  const initial = agentGuidanceSettings()
  const state = updateAgentGuidance({ key: 'language', value: 'mew', revision: initial.revision })
  assert.equal(state.settings.language, 'mew')
  const root = path.join(DATA_DIR, 'language-project')
  fs.mkdirSync(root, { recursive: true })
  const binding = { projectRoot: root, docsRoot: path.join(root, 'docs') }
  for (const [locale, key] of [['ko', 'ko'], ['en', 'en'], ['ja', 'ja'], ['zh-CN', 'zh']] as const) {
    const context = agentContextText(binding, root, locale)
    assert.ok(context.includes(guidanceOptions.language[key]))
    assert.ok(!context.includes(guidanceOptions.language.mew))
    assert.equal(fs.readFileSync(AGENT_GUIDANCE_PATH, 'utf8'), state.content)
    assert.equal(agentGuidanceSettings().settings.language, 'mew')
  }
  assert.ok(agentContextText(binding, root).includes(guidanceOptions.language.mew))
  assert.ok(readAgentGuidance('invalid').includes(guidanceOptions.language.mew))
  updateAgentGuidance({ key: 'language', value: 'ko', revision: state.revision })
  assert.ok(agentContextText(binding, root, 'en').includes(guidanceOptions.language.ko))
})

test('commit language defaults to English and all selections preserve response language and handwritten guidance', async () => {
  const { agentGuidanceSettings, updateAgentGuidance } = await import('./agent-guidance.ts')
  const handwritten = '# Existing instructions\n\nKeep my release rules.\n'
  fs.writeFileSync(AGENT_GUIDANCE_PATH, handwritten)
  let state = agentGuidanceSettings()
  assert.equal(state.settings.commitLanguage, 'en')
  assert.equal(readCommitLanguageGuidance('ko'), guidanceOptions.commitLanguage.en)
  assert.equal(fs.readFileSync(AGENT_GUIDANCE_PATH, 'utf8'), handwritten, 'effective defaults never rewrite existing files')
  state = updateAgentGuidance({ key: 'language', value: 'ko', revision: state.revision })
  for (const value of ['en', 'ko', 'ja', 'zh', 'mew', 'agent'] as const) {
    state = updateAgentGuidance({ key: 'commitLanguage', value, revision: state.revision })
    assert.equal(state.settings.commitLanguage, value)
    assert.equal(state.settings.language, 'ko')
    assert.ok(state.content.startsWith(handwritten))
    assert.ok(state.content.includes(guidanceOptions.commitLanguage[value]))
    assert.equal(state.content.split('<!-- mew:agent-setting:commitLanguage -->').length - 1, 1)
  }
  fs.writeFileSync(AGENT_GUIDANCE_PATH, '')
  assert.equal(agentGuidanceSettings().settings.commitLanguage, 'en')
  assert.equal(readCommitLanguageGuidance(), guidanceOptions.commitLanguage.en)
  assert.equal(fs.readFileSync(AGENT_GUIDANCE_PATH, 'utf8'), '')
})

test('commit language resolves each UI or response preference at request time without changing saved choices', async () => {
  const { agentGuidanceSettings, updateAgentGuidance } = await import('./agent-guidance.ts')
  fs.writeFileSync(AGENT_GUIDANCE_PATH, '# Commit language resolution\n')
  let state = agentGuidanceSettings()
  state = updateAgentGuidance({ key: 'commitLanguage', value: 'mew', revision: state.revision })
  for (const [locale, key] of [['ko', 'ko'], ['en', 'en'], ['ja', 'ja'], ['zh-CN', 'zh']] as const) {
    assert.equal(readCommitLanguageGuidance(locale), guidanceOptions.commitLanguage[key])
    assert.equal(agentGuidanceSettings().settings.commitLanguage, 'mew')
    assert.equal(fs.readFileSync(AGENT_GUIDANCE_PATH, 'utf8'), state.content)
  }
  assert.equal(readCommitLanguageGuidance(), guidanceOptions.commitLanguage.mew)
  assert.equal(readCommitLanguageGuidance('invalid'), guidanceOptions.commitLanguage.mew)
  state = updateAgentGuidance({ key: 'commitLanguage', value: 'agent', revision: state.revision })
  for (const value of ['ko', 'en', 'ja', 'zh'] as const) {
    state = updateAgentGuidance({ key: 'language', value, revision: state.revision })
    assert.equal(readCommitLanguageGuidance('ja'), guidanceOptions.commitLanguage[value])
    assert.equal(agentGuidanceSettings().settings.commitLanguage, 'agent')
  }
  state = updateAgentGuidance({ key: 'language', value: 'mew', revision: state.revision })
  assert.equal(readCommitLanguageGuidance('zh-CN'), guidanceOptions.commitLanguage.zh)
  assert.ok(readCommitLanguageGuidance().includes(guidanceOptions.commitLanguage.agent))
  assert.ok(readCommitLanguageGuidance().includes(guidanceOptions.language.mew))
  assert.match(readCommitLanguageGuidance(), /use English for this automatic planning request/)
  state = updateAgentGuidance({ key: 'language', value: 'inherit', revision: state.revision })
  assert.ok(readCommitLanguageGuidance('en').includes(guidanceOptions.commitLanguage.agent))
  assert.match(readCommitLanguageGuidance('en'), /use English for this automatic planning request/)
  state = updateAgentGuidance({ key: 'language', value: 'ko', revision: state.revision })
  fs.writeFileSync(AGENT_GUIDANCE_PATH, state.content.replace(guidanceOptions.language.ko, 'Follow each project’s response language.'))
  assert.ok(readCommitLanguageGuidance('ja').includes(guidanceOptions.commitLanguage.agent))
  assert.match(readCommitLanguageGuidance('ja'), /Follow each project’s response language/)
  state = agentGuidanceSettings()
  state = updateAgentGuidance({ key: 'language', value: 'inherit', revision: state.revision })
  fs.writeFileSync(AGENT_GUIDANCE_PATH, state.content + '\nAlways respond in Japanese.\n')
  assert.match(readCommitLanguageGuidance('ko'), /Always respond in Japanese\./, 'inherit includes handwritten response guidance instead of borrowing the preset language')
  state = agentGuidanceSettings()
  state = updateAgentGuidance({ key: 'commitLanguage', value: 'en', revision: state.revision })
  assert.equal(readCommitLanguageGuidance('ko'), guidanceOptions.commitLanguage.en, 'a concrete commit language is independent of response and UI preferences')
})

test('AI language snapshots freeze only managed language choices and keep handwritten and other live guidance intact', async () => {
  const { agentGuidanceSettings, updateAgentGuidance } = await import('./agent-guidance.ts')
  fs.writeFileSync(AGENT_GUIDANCE_PATH, '# Keep handwritten release policy\n')
  let state = agentGuidanceSettings()
  state = updateAgentGuidance({ key: 'commitLanguage', value: 'agent', revision: state.revision })
  state = updateAgentGuidance({ key: 'language', value: 'ja', revision: state.revision })
  fs.writeFileSync(AGENT_GUIDANCE_PATH, state.content.replace(guidanceOptions.language.ja, 'Always respond in Japanese.'))
  const snapshot = captureCommitLanguageSnapshot('ko')
  assert.equal(snapshot?.responseLanguage, 'Always respond in Japanese.')
  state = agentGuidanceSettings()
  state = updateAgentGuidance({ key: 'commitLanguage', value: 'ko', revision: state.revision })
  state = updateAgentGuidance({ key: 'language', value: 'en', revision: state.revision })
  state = updateAgentGuidance({ key: 'debugger', value: 'disabled', revision: state.revision })
  fs.writeFileSync(AGENT_GUIDANCE_PATH, state.content + '\nKeep this new handwritten rule.\n')
  const live = fs.readFileSync(AGENT_GUIDANCE_PATH, 'utf8')
  runWithCommitLanguageSnapshot(snapshot, () => {
    const text = readAgentGuidance('ko')
    assert.ok(text.includes(guidanceOptions.commitLanguage.agent))
    assert.match(text, /Always respond in Japanese\./)
    assert.ok(!text.includes(guidanceOptions.commitLanguage.ko))
    assert.ok(!text.includes(guidanceOptions.language.en))
    assert.ok(text.includes(guidanceOptions.debugger.disabled))
    assert.match(text, /Keep handwritten release policy/)
    assert.match(text, /Keep this new handwritten rule/)
  })
  assert.equal(fs.readFileSync(AGENT_GUIDANCE_PATH, 'utf8'), live)
  assert.ok(readAgentGuidance().includes(guidanceOptions.commitLanguage.ko))
  assert.ok(readAgentGuidance().includes(guidanceOptions.language.en))
  state = agentGuidanceSettings()
  updateAgentGuidance({ key: 'language', value: 'inherit', revision: state.revision })
  const inherit = captureCommitLanguageSnapshot()
  state = agentGuidanceSettings()
  updateAgentGuidance({ key: 'language', value: 'ja', revision: state.revision })
  runWithCommitLanguageSnapshot(inherit, () => assert.ok(!readAgentGuidance().includes(guidanceOptions.language.ja)))
  fs.writeFileSync(AGENT_GUIDANCE_PATH, '')
  runWithCommitLanguageSnapshot(undefined, () => assert.equal(readCommitLanguageGuidance(), guidanceOptions.commitLanguage.en))
  runWithCommitLanguageSnapshot({ commitLanguage: '', responseLanguage: null }, () => assert.equal(readCommitLanguageGuidance(), guidanceOptions.commitLanguage.en))
})

test('custom or damaged commit language blocks are preserved and invalid or stale writes are rejected', async () => {
  const { agentGuidanceSettings, updateAgentGuidance, GuidanceError } = await import('./agent-guidance.ts')
  const start = '<!-- mew:agent-setting:commitLanguage -->', end = '<!-- /mew:agent-setting:commitLanguage -->'
  const custom = `${start}\nWrite commit messages in the release language.\n${end}`
  fs.writeFileSync(AGENT_GUIDANCE_PATH, custom)
  let state = agentGuidanceSettings()
  assert.equal(state.settings.commitLanguage, 'custom')
  assert.equal(readCommitLanguageGuidance('ko'), 'Write commit messages in the release language.')
  state = updateAgentGuidance({ key: 'detail', value: 'concise', revision: state.revision })
  assert.ok(state.content.startsWith(custom))
  assert.throws(() => updateAgentGuidance({ key: 'commitLanguage', value: 'inherit', revision: state.revision }), GuidanceError)
  assert.throws(() => updateAgentGuidance({ key: 'commitLanguage', value: 'en', revision: 'stale' }), GuidanceError)
  for (const broken of [
    `${start}Missing end`, end, `${start}x${end}${start}y${end}`,
    `${start}<!-- mew:agent-setting:language -->${guidanceOptions.language.mew}${end}<!-- /mew:agent-setting:language -->`,
  ]) {
    fs.writeFileSync(AGENT_GUIDANCE_PATH, broken)
    state = agentGuidanceSettings()
    assert.equal(state.settings.commitLanguage, 'custom')
    assert.equal(readCommitLanguageGuidance('ko'), '')
    assert.ok(readAgentGuidance('ko').startsWith(broken))
    assert.ok(!readAgentGuidance('ko').includes(guidanceOptions.commitLanguage.en))
    assert.throws(() => updateAgentGuidance({ key: 'commitLanguage', value: 'en', revision: state.revision }), GuidanceError)
    assert.equal(fs.readFileSync(AGENT_GUIDANCE_PATH, 'utf8'), broken)
  }
})

test('Mew-wide additional guidance preserves handwritten rules and other preferences and rejects stale or invalid updates', async () => {
  const { agentGuidanceSettings, updateAgentGuidance, GuidanceError } = await import('./agent-guidance.ts')
  const handwritten = '# Existing guidance\n\nKeep my deployment policy.\n'
  fs.writeFileSync(AGENT_GUIDANCE_PATH, handwritten)
  let state = agentGuidanceSettings()
  assert.equal(state.instructions, '')
  state = updateAgentGuidance({ key: 'language', value: 'ko', revision: state.revision })
  state = updateAgentGuidance({ key: 'subagents', value: 'explicit', revision: state.revision })
  const before = state
  state = updateAgentGuidance({ key: 'instructions', value: '  Shared custom rules\n\nKeep this paragraph.  ', revision: state.revision })
  assert.equal(state.instructions, 'Shared custom rules\n\nKeep this paragraph.')
  assert.deepEqual(state.settings, before.settings)
  assert.deepEqual(state.branch, before.branch)
  assert.ok(state.content.startsWith(handwritten))
  assert.notEqual(state.revision, before.revision)
  assert.throws(() => updateAgentGuidance({ key: 'instructions', value: 'Overwrite', revision: before.revision }), (error: unknown) => error instanceof GuidanceError && error.status === 409)
  for (const invalid of [null, 'x'.repeat(8001), '<!-- mew:agent-setting:language -->Override', '<!-- /mew:agent-setting:instructions -->']) {
    assert.throws(() => updateAgentGuidance({ key: 'instructions', value: invalid, revision: state.revision }), GuidanceError)
    assert.equal(agentGuidanceSettings().content, state.content, 'rejected updates leave the guidance unchanged')
  }
  state = updateAgentGuidance({ key: 'instructions', value: 'x'.repeat(8000), revision: state.revision })
  assert.equal(state.instructions?.length, 8000)
  state = updateAgentGuidance({ key: 'instructions', value: ' \n ', revision: state.revision })
  assert.equal(state.instructions, '')
  assert.doesNotMatch(state.content, /mew:agent-setting:instructions/)
  assert.deepEqual(state.settings, before.settings)
  assert.deepEqual(state.branch, before.branch)
  assert.ok(state.content.startsWith(handwritten))
})

test('additional guidance is account-wide while project instructions stay local and take precedence on the next request', async () => {
  const { agentGuidanceSettings, updateAgentGuidance } = await import('./agent-guidance.ts')
  const roots = ['scope-a', 'scope-b'].map(name => path.join(DATA_DIR, name))
  for (const root of roots) fs.mkdirSync(root, { recursive: true })
  const context = (root: string) => agentContextText({ projectRoot: root, docsRoot: path.join(root, 'docs') }, root)
  const account = 'guidance-scopes@example.test'
  runWithAgentAccount(account, () => {
    const initial = agentGuidanceSettings()
    updateAgentGuidance({ key: 'instructions', value: 'Shared rule for both projects.', revision: initial.revision })
    for (const root of roots) assert.match(context(root), /Shared rule for both projects\./)
  })
  writeProjectAgentSettings(roots[0], { ...defaultAgentSettings(), instructions: 'Only the first project forbids server restarts.' })
  runWithAgentAccount(account, () => {
    const first = context(roots[0])
    assert.match(first, /Shared rule for both projects\./)
    assert.match(first, /Only the first project forbids server restarts\./)
    assert.match(first, /take precedence over conflicting Mew-wide preferences/)
    assert.doesNotMatch(context(roots[1]), /Only the first project/)
    const state = agentGuidanceSettings()
    updateAgentGuidance({ key: 'instructions', value: 'Updated shared rule.', revision: state.revision })
    for (const root of roots) {
      assert.match(context(root), /Updated shared rule\./)
      assert.doesNotMatch(context(root), /Shared rule for both projects/)
    }
  })
  runWithAgentAccount('other-guidance-scopes@example.test', () => {
    assert.equal(agentGuidanceSettings().instructions, '')
    for (const root of roots) assert.doesNotMatch(context(root), /Shared rule for both projects|Updated shared rule/)
    assert.match(context(roots[0]), /Only the first project forbids server restarts\./, 'project instructions apply independently of the account-wide preference')
  })
})

test('the default Mew-wide guidance does not prohibit building or restarting other projects', () => {
  runWithAgentAccount('default-guidance-scopes@example.test', () => {
    const guidance = readAgentGuidance()
    assert.doesNotMatch(guidance, /Coding agents must not|must not (?:run.*build|build|restart)|user (?:runs|performs) builds/i)
  })
})
