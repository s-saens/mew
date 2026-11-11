import test from 'node:test'
import assert from 'node:assert/strict'
import { projectSettingPrompt } from './project-setting-prompt.ts'

test('new projects interview before creating and then use the default project setting skill', () => {
  const prompt = projectSettingPrompt('Garden')
  assert.match(prompt, /Start by asking me a focused question/)
  assert.match(prompt, /do not generate the project before I answer/)
  assert.match(prompt, /mew-project-setting is enabled in the supplied Mew skill catalog/)
  assert.match(prompt, /without loading disabled or removed skills/)
  assert.match(prompt, /configured Documents location/)
  assert.match(prompt, /Mew default instructions/)
})

test('existing project settings preserve work and do not require project creation', () => {
  const prompt = projectSettingPrompt('Garden', true)
  assert.match(prompt, /mew-project-setting is enabled in the supplied Mew skill catalog/)
  assert.match(prompt, /existing project/)
  assert.match(prompt, /build and deployment actions/)
  assert.match(prompt, /must not block/)
  assert.match(prompt, /user instructions and other applicable skills/)
  assert.doesNotMatch(prompt, /do not generate the project before I answer/)
  assert.doesNotMatch(prompt, /\/mew-project-setting/)
})
