import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setBrowserStorageScope } from '@mew/ui/browser-storage-scope'
import { deleteSavedAgentPrompt, readSavedAgentPrompts, saveAgentPrompt } from './agent-saved-prompts.ts'

class MemoryStorage {
  store = new Map<string, string>()
  fail = false
  get length() { return this.store.size }
  key(index: number) { return [...this.store.keys()][index] ?? null }
  getItem(key: string) { return this.store.get(key) ?? null }
  removeItem(key: string) { this.store.delete(key) }
  setItem(key: string, value: string) {
    if (this.fail) throw new Error('Quota exceeded')
    this.store.set(key, value)
  }
}
let storage: MemoryStorage
beforeEach(() => {
  storage = new MemoryStorage()
  ;(globalThis as { localStorage?: unknown }).localStorage = storage
  setBrowserStorageScope()
})
const prompt = (text: string, cliMode = false) => ({ text, cliMode, attachments: [] })

test('saved prompts preserve exact text, CLI mode and image bytes independently of tab drafts', () => {
  const input = { ...prompt('  Inspect [[.workspace:.mew/temp/assets/photo.png]]\n'), attachments: [
    { project: '.workspace', path: '.mew/temp/assets/photo.png', mimeType: 'image/png', image: { data: 'cGhvdG8=', mimeType: 'image/png' } },
  ] }
  storage.setItem('mew:agent-input-drafts', '{"tab":"unrelated input"}')
  const saved = saveAgentPrompt('/one', input)!
  assert.deepEqual(readSavedAgentPrompts('/one'), saved)
  assert.deepEqual(saved[0], { ...input, id: saved[0].id })
  assert.equal(storage.getItem('mew:agent-input-drafts'), '{"tab":"unrelated input"}')
  assert.equal(saveAgentPrompt('/one', prompt('pwd', true))![0].cliMode, true)
})

test('saving a duplicate moves it first without adding copies or dropping other drafts', () => {
  const original = saveAgentPrompt('/one', prompt('first'))![0]
  saveAgentPrompt('/one', prompt('second'))
  const saved = saveAgentPrompt('/one', prompt('first'))!
  assert.deepEqual(saved.map(item => item.text), ['first', 'second'])
  assert.equal(saved[0].id, original.id)
  assert.equal(saveAgentPrompt('/one', prompt(' \n '))!.length, 2)
})

test('project and account scopes are isolated and deleting affects only its selected draft', () => {
  setBrowserStorageScope('one', 'host')
  const first = saveAgentPrompt('/one', prompt('first'))![0]
  saveAgentPrompt('/one', prompt('second'))
  saveAgentPrompt('/two', prompt('other project'))
  assert.deepEqual(deleteSavedAgentPrompt('/one', first.id)!.map(item => item.text), ['second'])
  assert.equal(readSavedAgentPrompts('/two')[0].text, 'other project')
  setBrowserStorageScope('two', 'host')
  assert.deepEqual(readSavedAgentPrompts('/one'), [])
  setBrowserStorageScope()
})

test('failed explicit save or delete preserves existing prompts and reports failure', () => {
  const saved = saveAgentPrompt('/one', prompt('keep'))!
  storage.fail = true
  assert.equal(saveAgentPrompt('/one', prompt('new')), null)
  assert.equal(deleteSavedAgentPrompt('/one', saved[0].id), null)
  assert.deepEqual(readSavedAgentPrompts('/one'), saved)
})

test('invalid saved data does not crash the picker', () => {
  const key = 'mew:agent-saved-prompts:"/one"'
  for (const value of ['{broken', 'null', '{}', '[null,{}, {"text":"invalid"}]']) {
    storage.setItem(key, value)
    assert.deepEqual(readSavedAgentPrompts('/one'), [])
  }
})
