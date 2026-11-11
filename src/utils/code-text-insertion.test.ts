import assert from 'node:assert/strict'
import test from 'node:test'
import { EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { history, undo } from '@codemirror/commands'
import { prepareCodeTextInsertion } from './code-text-insertion.ts'

function fixture() {
  let state = EditorState.create({ doc: 'Before after', selection: { anchor: 7, head: 12 }, extensions: [history()] })
  const view = {
    get state() { return state },
    dispatch(spec: Parameters<EditorState['update']>[0]) { state = state.update(spec).state },
    focus() {},
  } as unknown as EditorView
  return view
}

test('source transcript replaces original selection literally and undoes as one edit', () => {
  const view = fixture()
  const insert = prepareCodeTextInsertion(view, () => true)
  view.dispatch({ selection: { anchor: 0 } })
  assert.equal(insert('<b>음성</b>\nnext'), true)
  assert.equal(view.state.doc.toString(), 'Before <b>음성</b>\nnext')
  assert.equal(insert('duplicate'), false)
  assert.equal(undo(view), true)
  assert.equal(view.state.doc.toString(), 'Before after')
})

test('source transcript rejects a changed document or switched editor', () => {
  const view = fixture()
  const insert = prepareCodeTextInsertion(view, () => true)
  view.dispatch({ changes: { from: 0, insert: 'new ' } })
  assert.equal(insert('wrong'), false)
  assert.equal(prepareCodeTextInsertion(view, () => false)('wrong'), false)
})
