import test from 'node:test'
import assert from 'node:assert/strict'
import { panelModelState, splitModelVariant, modelVariantId } from '../../shared/codex-models.ts'

test('Codex panel groups efforts without removing meaningful model name qualifiers', () => {
  const models = { currentModelId: 'astra[high]', availableModels: [
    { modelId: 'astra[low]', name: 'Astra (low)' },
    { modelId: 'astra[high]', name: 'Astra (high)' },
    { modelId: 'special[medium]', name: 'Special (preview) (medium)' },
    { modelId: 'plain', name: 'Plain (preview)' },
  ] }
  assert.deepEqual(panelModelState('codex', models), {
    currentModelId: 'astra', availableModels: [
      { modelId: 'astra', name: 'Astra' },
      { modelId: 'special', name: 'Special (preview)' },
      { modelId: 'plain', name: 'Plain (preview)' },
    ],
  })
  assert.equal(panelModelState('claude', models), models)
  assert.equal(panelModelState('codex', null), null)
})


test('Antigravity groups advertised effort labels while preserving opaque execution IDs and qualifiers', () => {
  const availableModels = [
    { modelId: 'gemini-pro-high', name: 'Gemini Pro (High)' },
    { modelId: 'oauth-unrelated-id', name: 'Gemini Pro (Low)' },
    { modelId: 'flash-med', name: 'Flash (preview) (Medium)' },
    { modelId: 'plain-high', name: 'Plain (preview)' },
  ]
  assert.deepEqual(panelModelState('antigravity', { currentModelId: 'oauth-unrelated-id', availableModels }), {
    currentModelId: 'Gemini Pro', availableModels: [
      { modelId: 'Gemini Pro', name: 'Gemini Pro' },
      { modelId: 'Flash (preview)', name: 'Flash (preview)' },
      { modelId: 'plain-high', name: 'Plain (preview)' },
    ],
  })
  assert.deepEqual(splitModelVariant('antigravity', 'missing', availableModels), { model: 'missing', effort: null })
  assert.equal(modelVariantId('antigravity', availableModels, 'Gemini Pro', 'low'), 'oauth-unrelated-id')
  assert.equal(modelVariantId('antigravity', availableModels, 'Gemini Pro', 'medium'), undefined)
})
