import assert from 'node:assert/strict'
import test from 'node:test'
import { Window } from 'happy-dom'
import { prepareTextInsertion } from './textInsertion.ts'

const win = new Window({ url: 'http://localhost' })
for (const name of ['window', 'document', 'navigator', 'DOMParser', 'Node', 'Element', 'HTMLElement', 'Text', 'DocumentFragment', 'getComputedStyle', 'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  Object.defineProperty(globalThis, name, { value: (win as unknown as Record<string, unknown>)[name], configurable: true })
}
const { Editor } = await import('@tiptap/core')
const { default: StarterKit } = await import('@tiptap/starter-kit')

test('deferred transcript inserts literal text at the captured selection and is one-shot', t => {
  const editor = new Editor({ element: document.createElement('div'), extensions: [StarterKit], content: '<p>Before after</p>' })
  t.after(() => editor.destroy())
  editor.commands.setTextSelection({ from: 8, to: 13 })
  const insert = prepareTextInsertion(editor)
  editor.commands.setTextSelection(1)
  assert.equal(insert('<b>음성</b>\nnext'), true)
  assert.equal(editor.getText(), 'Before <b>음성</b>\nnext')
  assert.equal(editor.view.dom.querySelector('b'), null)
  assert.equal(insert('duplicate'), false)
  assert.equal(editor.commands.undo(), true)
  assert.equal(editor.getText(), 'Before after')
})

test('deferred transcript rejects document edits, revoked editability, stale scopes and destroyed editors', t => {
  const editor = new Editor({ element: document.createElement('div'), extensions: [StarterKit], content: '<p>Original</p>' })
  t.after(() => { if (!editor.isDestroyed) editor.destroy() })
  const changed = prepareTextInsertion(editor)
  editor.commands.insertContent('new ')
  assert.equal(changed('wrong'), false)
  const locked = prepareTextInsertion(editor)
  editor.setEditable(false)
  assert.equal(locked('wrong'), false)
  editor.setEditable(true)
  const stale = prepareTextInsertion(editor, () => false)
  assert.equal(stale('wrong'), false)
  const destroyed = prepareTextInsertion(editor)
  editor.destroy()
  assert.equal(destroyed('wrong'), false)
})
