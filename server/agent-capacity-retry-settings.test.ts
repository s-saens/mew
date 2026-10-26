import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { AGENT_GUIDANCE_PATH, GuidanceError, agentGuidancePath, agentGuidanceSettings, readAgentCapacityRetrySettings, readAgentGuidance, updateAgentGuidance } from './agent-guidance.ts'
import { runWithAgentAccount } from './agent-account-settings.ts'
import { agentCapacityRetryMetadata, agentCapacityRetryValidationError, defaultAgentCapacityRetrySettings } from '../shared/agent-capacity-retry.ts'

test('capacity retry defaults need no saved state and each account reads its current policy', () => {
  assert.deepEqual(readAgentCapacityRetrySettings(), { delaySeconds: 30, maxRetries: 20 })
  assert.equal(fs.existsSync(AGENT_GUIDANCE_PATH), false)
  runWithAgentAccount('capacity-a@example.test', () => {
    let state = agentGuidanceSettings()
    fs.writeFileSync(state.path, '# Keep handwritten policy\n')
    state = agentGuidanceSettings()
    state = updateAgentGuidance({ key: 'language', value: 'ko', revision: state.revision })
    const original = state
    state = updateAgentGuidance({ key: 'capacityRetry', value: { delaySeconds: 45, maxRetries: 12 }, revision: state.revision })
    assert.ok(state.content.startsWith(original.content))
    assert.deepEqual(state.settings, original.settings)
    assert.deepEqual(state.branch, original.branch)
    assert.deepEqual(state.capacityRetry, { delaySeconds: 45, maxRetries: 12 })
    assert.deepEqual(readAgentCapacityRetrySettings(), state.capacityRetry)
    assert.match(readAgentGuidance(), /Keep handwritten policy/)
    assert.doesNotMatch(readAgentGuidance(), /capacityRetry|agent-capacity-retry|delaySeconds|maxRetries/)
    assert.throws(() => updateAgentGuidance({ key: 'capacityRetry', value: defaultAgentCapacityRetrySettings, revision: original.revision }), (error: unknown) => error instanceof GuidanceError && error.status === 409)
    const edited = state.content.replace(agentCapacityRetryMetadata({ delaySeconds: 45, maxRetries: 12 }), agentCapacityRetryMetadata({ delaySeconds: 2, maxRetries: 0 }))
    fs.writeFileSync(agentGuidancePath(), edited)
    assert.deepEqual(readAgentCapacityRetrySettings(), { delaySeconds: 2, maxRetries: 0 }, 'external edits are read without caching')
    assert.equal(agentGuidanceSettings().revision === state.revision, false)
    assert.equal(fs.readFileSync(agentGuidancePath(), 'utf8'), edited, 'runtime reads never rewrite user guidance')
  })
  runWithAgentAccount('capacity-b@example.test', () => {
    assert.deepEqual(readAgentCapacityRetrySettings(), defaultAgentCapacityRetrySettings)
    assert.deepEqual(agentGuidanceSettings().capacityRetry, defaultAgentCapacityRetrySettings)
  })
  runWithAgentAccount('capacity-a@example.test', () => assert.deepEqual(readAgentCapacityRetrySettings(), { delaySeconds: 2, maxRetries: 0 }))
})

test('capacity retry validates both bounded integers and rejects unknown or malformed settings without writing', () => {
  fs.writeFileSync(AGENT_GUIDANCE_PATH, '# Validate policy\n')
  let state = agentGuidanceSettings()
  for (const value of [
    null, [], {}, '30', { delaySeconds: 30 }, { maxRetries: 20 },
    { delaySeconds: 30, maxRetries: 20, extra: true },
    { delaySeconds: '30', maxRetries: 20 }, { delaySeconds: 30, maxRetries: '20' },
    { delaySeconds: 0, maxRetries: 20 }, { delaySeconds: 3601, maxRetries: 20 },
    { delaySeconds: 1.5, maxRetries: 20 }, { delaySeconds: NaN, maxRetries: 20 },
    { delaySeconds: 30, maxRetries: -1 }, { delaySeconds: 30, maxRetries: 101 },
    { delaySeconds: 30, maxRetries: 2.5 }, { delaySeconds: 30, maxRetries: Infinity },
  ]) {
    assert.ok(agentCapacityRetryValidationError(value))
    assert.throws(() => updateAgentGuidance({ key: 'capacityRetry', value, revision: state.revision }), (error: unknown) => error instanceof GuidanceError && error.status === 400)
    assert.equal(fs.readFileSync(AGENT_GUIDANCE_PATH, 'utf8'), state.content)
  }
  for (const value of [{ delaySeconds: 1, maxRetries: 0 }, { delaySeconds: 3600, maxRetries: 100 }]) {
    assert.equal(agentCapacityRetryValidationError(value), undefined)
    state = updateAgentGuidance({ key: 'capacityRetry', value, revision: state.revision })
    assert.deepEqual(state.capacityRetry, value)
    assert.deepEqual(readAgentCapacityRetrySettings(), value)
    assert.equal(state.content.split('<!-- mew:agent-setting:capacityRetry -->').length - 1, 1)
  }
})

test('malformed capacity metadata falls back without leaking policy into model instructions or damaging handwritten text', () => {
  const start = '<!-- mew:agent-setting:capacityRetry -->', end = '<!-- /mew:agent-setting:capacityRetry -->'
  for (const metadata of [
    '<!-- mew:agent-capacity-retry:v1 nope -->',
    '<!-- mew:agent-capacity-retry:v1 {"delaySeconds":30,"maxRetries":200} -->',
    '<!-- mew:agent-capacity-retry:v1 {"delaySeconds":30,"maxRetries":20,"extra":true} -->',
    '<!-- mew:agent-capacity-retry:v2 {"delaySeconds":1,"maxRetries":1} -->',
  ]) {
    const content = `Keep handwritten rules.\n${start}\n${metadata}\n${end}\nKeep trailing rules.`
    fs.writeFileSync(AGENT_GUIDANCE_PATH, content)
    assert.deepEqual(readAgentCapacityRetrySettings(), defaultAgentCapacityRetrySettings)
    assert.deepEqual(agentGuidanceSettings().capacityRetry, defaultAgentCapacityRetrySettings)
    assert.doesNotMatch(readAgentGuidance(), /agent-capacity-retry|capacityRetry/)
    assert.match(readAgentGuidance(), /Keep handwritten rules/)
    assert.match(readAgentGuidance(), /Keep trailing rules/)
    assert.equal(fs.readFileSync(AGENT_GUIDANCE_PATH, 'utf8'), content)
  }
  for (const content of [
    `${start}\n${agentCapacityRetryMetadata({ delaySeconds: 1, maxRetries: 1 })}`,
    `${end}\nKeep handwritten rules.`,
    `${start}\n${agentCapacityRetryMetadata({ delaySeconds: 1, maxRetries: 1 })}\n${end}\n${start}\n${end}`,
    `${start}\n<!-- mew:agent-setting:instructions -->\nKeep nested rules.\n${end}\n<!-- /mew:agent-setting:instructions -->`,
  ]) {
    fs.writeFileSync(AGENT_GUIDANCE_PATH, content)
    const state = agentGuidanceSettings()
    assert.deepEqual(readAgentCapacityRetrySettings(), defaultAgentCapacityRetrySettings)
    assert.throws(() => updateAgentGuidance({ key: 'capacityRetry', value: defaultAgentCapacityRetrySettings, revision: state.revision }), (error: unknown) => error instanceof GuidanceError && error.status === 409)
    assert.equal(fs.readFileSync(AGENT_GUIDANCE_PATH, 'utf8'), content)
  }
})

test('runtime policy removal preserves handwritten metadata examples outside the settings block', () => {
  const example = `Handwritten example:\n\`\`\`html\n${agentCapacityRetryMetadata({ delaySeconds: 3, maxRetries: 4 })}\n\`\`\`\n`
  fs.writeFileSync(AGENT_GUIDANCE_PATH, example)
  const state = agentGuidanceSettings()
  updateAgentGuidance({ key: 'capacityRetry', value: { delaySeconds: 45, maxRetries: 12 }, revision: state.revision })
  const guidance = readAgentGuidance()
  assert.ok(guidance.startsWith(example))
  assert.ok(!guidance.includes(agentCapacityRetryMetadata({ delaySeconds: 45, maxRetries: 12 })))
  assert.doesNotMatch(guidance, /mew:agent-setting:capacityRetry/)
  assert.deepEqual(readAgentCapacityRetrySettings(), { delaySeconds: 45, maxRetries: 12 })
})
