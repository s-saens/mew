import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-agent-defaults-'))
process.env.MEW_DATA_DIR = dir

const { AgentDefaultError, readAgentDefault, writeAgentDefault } = await import('./agentDefaults.ts')

test('런타임별 모델·권한 기본값을 서버 데이터 폴더에 영속화한다', () => {
  assert.equal(readAgentDefault('codex'), null)

  const saved = writeAgentDefault('codex', { modelId: 'gpt-5.6-sol-high', modeId: 'agent-full-access' })
  assert.deepEqual(saved, { modelId: 'gpt-5.6-sol-high', modeId: 'agent-full-access' })
  assert.deepEqual(readAgentDefault('codex'), saved)

  const file = JSON.parse(fs.readFileSync(path.join(dir, 'agent-defaults.json'), 'utf8'))
  assert.deepEqual(file.codex, saved)
})

test('빈 설정과 등록되지 않은 런타임은 저장하지 않는다', () => {
  assert.throws(() => writeAgentDefault('codex', {}), AgentDefaultError)
  assert.throws(() => writeAgentDefault('unknown', { modelId: 'x' }), AgentDefaultError)
})


test('execution defaults are validated and isolated by runtime', () => {
  const codex = { modelId: 'model-a', thinkingId: 'high', modeId: 'default', execution: { build: false, deploy: true } }
  const claude = { modelId: 'model-b', execution: { build: true, deploy: false } }
  writeAgentDefault('codex', codex)
  writeAgentDefault('claude', claude)
  assert.deepEqual(readAgentDefault('codex'), codex)
  assert.deepEqual(readAgentDefault('claude'), claude)
  assert.throws(() => writeAgentDefault('codex', { execution: { build: 'false', deploy: false } }), AgentDefaultError)
})
