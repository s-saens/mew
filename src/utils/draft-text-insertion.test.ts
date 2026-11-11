import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareDraftTextInsertion } from './draft-text-insertion.ts'

test('transcript replaces the captured draft selection once without submitting', () => {
  let value = '[[mew-document:docs:note.md|Note]] replace end', start = value.indexOf('replace'), end = start + 7
  const input = {
    get value() { return value }, get selectionStart() { return start }, get selectionEnd() { return end },
    setSelectionRange(from: number, to: number) { start = from; end = to },
    insertText(text: string) { value = value.slice(0, start) + text + value.slice(end) },
    focus() {},
  }
  const insert = prepareDraftTextInsertion(input, () => true)
  input.setSelectionRange(0, 0)
  assert.equal(insert('음성 입력'), true)
  assert.equal(value, '[[mew-document:docs:note.md|Note]] 음성 입력 end')
  assert.equal(insert('duplicate'), false)
})

test('transcript refuses changed drafts and replaced composer handles', () => {
  let value = 'before', current = true
  const input = { get value() { return value }, selectionStart: 0, selectionEnd: 0, focus() {}, setSelectionRange() {}, insertText() { throw new Error('must not insert') } }
  const changed = prepareDraftTextInsertion(input, () => current)
  value = 'updated'
  assert.equal(changed('wrong'), false)
  const replaced = prepareDraftTextInsertion(input, () => current)
  current = false
  assert.equal(replaced('wrong'), false)
})
