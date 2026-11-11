import './test-isolated-data.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { removeUser, revokeAccountCredentials, upsertUser } from './auth.ts'
import { readSpeechConfig, writeSpeechConfig } from './speech-settings.ts'

test('deleting an account removes saved speech credentials and configuration', () => {
  const account = 'speech-deleted@example.test'
  upsertUser(account, { role: 'manager', hash: 'unused', mustChangePassword: false, createdAt: Date.now(), passwordChangedAt: 0 })
  writeSpeechConfig(account, { provider: 'openai', baseUrl: 'https://example.test/v1', model: 'whisper-1', language: '', allowModelDownload: false, apiKey: 'test-private-key' })
  assert.equal(readSpeechConfig(account).apiKey, 'test-private-key')
  assert.equal(removeUser(account), true)
  assert.equal(readSpeechConfig(account).apiKey, '')
  assert.equal(readSpeechConfig(account).provider, 'faster-whisper')
})

test('revoking a merged account clears its speech key before the identity can be reused', () => {
  const account = 'speech-merged@example.test'
  writeSpeechConfig(account, { provider: 'openai', baseUrl: 'https://example.test/v1', model: 'whisper-1', language: '', allowModelDownload: false, apiKey: 'merged-test-key' })
  revokeAccountCredentials(account)
  assert.equal(readSpeechConfig(account).apiKey, '')
  assert.equal(readSpeechConfig(account).provider, 'faster-whisper')
})
