import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { build } from 'rolldown'
import { Window } from 'happy-dom'

const root = path.resolve(import.meta.dirname, '..')
const documentToken = '[[docs:guides/문서 #1%.md]]'
const titledDocumentToken = '[[mew-document:docs:guides/문서 #1%.md|Document title]]'
const projectToken = '[[.workspace:src/main.ts]]'

test('composer and scheduled previews render atomic document tags and retain exact reference values', async () => {
  const source = `import React, {act, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {EditorView} from '@codemirror/view';
import {cursorCharLeft, cursorCharRight, deleteCharBackward, deleteCharForward, undo, redo} from '@codemirror/commands';
import {MentionTextarea} from '${root}/src/components/MentionTextarea.tsx';
import {AgentDocumentReferences} from '${root}/src/components/agent-document-tag.tsx';
window.IS_REACT_ACT_ENVIRONMENT = true;
const host = document.getElementById('root'), root = createRoot(host);
let handle, setText, setCli;
window.opened = [];
function Fixture() {
  const [value, setValue] = useState(''), [cli, updateCli] = useState(false), input = useRef(null);
  setText = setValue; setCli = updateCli;
  handle = () => input.current;
  return <><MentionTextarea imageCapable value={value} onChange={setValue} inputRef={input}
    options={[{id: 'guide', label: 'Guide', insert: ${JSON.stringify(documentToken)}}]}
    submitHint="Document input" onOpenFile={cli ? undefined : (...args) => window.opened.push(args)} />
    <button data-scheduled><AgentDocumentReferences text={value}/></button></>;
}
window.fixture = {
  mount: () => act(async () => root.render(<Fixture/>)),
  text: () => handle().value,
  reset: value => act(async () => setText(value)),
  cli: enabled => act(async () => setCli(enabled)),
  select: (from, to = from) => act(async () => handle().setSelectionRange(from, to)),
  selected: () => handle().selectionStart,
  insert: text => act(async () => handle().insertText(text)),
  key: key => act(async () => handle().element.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true}))),
  command: name => act(async () => ({left: cursorCharLeft, right: cursorCharRight, backspace: deleteCharBackward, delete: deleteCharForward, undo, redo})[name](EditorView.findFromDOM(handle().element))),
  click: selector => act(async () => document.querySelector(selector).click()),
  copy: () => {
    const view = EditorView.findFromDOM(handle().element);
    return view.state.facet(EditorView.clipboardOutputFilter).reduce((text, filter) => filter(text, view.state), view.state.sliceDoc());
  },
  destroy: () => act(async () => root.unmount()),
};`
  const bundle = await build({ input: 'virtual:document-tags.tsx', write: false, platform: 'browser',
    output: { format: 'iife', codeSplitting: false },
    onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'document-tags', resolveId(id) { if (id === 'virtual:document-tags.tsx') return id }, load(id) {
      if (id === 'virtual:document-tags.tsx') return source
      if (id.endsWith('.css')) return { code: '', moduleType: 'js' }
    } }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk'); assert.ok(chunk)
  const win = new Window({ url: 'http://document-tags.test' })
  win.console.timeStamp = () => {}
  Object.assign(win, { MessageChannel: class {
    port1 = { onmessage: null as (() => void) | null }
    port2 = { postMessage: () => { setTimeout(() => this.port1.onmessage?.(), 0) } }
  } })
  win.document.body.innerHTML = '<div id="root"></div>'
  win.eval(chunk.code)
  const fixture = (win as unknown as { fixture: {
    mount(): Promise<void>; reset(value: string): Promise<void>; cli(enabled: boolean): Promise<void>
    text(): string; select(from: number, to?: number): Promise<void>; command(name: string): Promise<void>
    selected(): number; insert(text: string): Promise<void>; key(key: string): Promise<void>
    click(selector: string): Promise<void>; copy(): string; destroy(): Promise<void>
  } }).fixture
  await fixture.mount()
  try {
    await fixture.insert('@Gu')
    await fixture.key('Enter')
    assert.equal(fixture.text(), `${documentToken} `, '@ selection inserts the unchanged scoped reference')
    assert.equal(win.document.querySelectorAll('.cm-content [data-document-token]').length, 1, '@ selection immediately becomes a document tag')
    const original = `before ${documentToken} between ${projectToken} after ${documentToken}`
    await fixture.reset(original)
    const editor = win.document.querySelector('.cm-content')!
    const preview = win.document.querySelector('[data-scheduled]')!
    assert.equal(editor.querySelectorAll('[data-document-token]').length, 3)
    assert.equal(preview.querySelectorAll('[data-agent-document]').length, 3)
    assert.equal(editor.textContent, 'before  between  after ', 'raw reference paths are hidden')
    assert.equal(preview.textContent, 'before  between  after ')
    assert.equal(preview.querySelectorAll('button, a').length, 0, 'schedule preview tags do not nest interactive controls')
    assert.equal(fixture.text(), original)
    assert.equal(fixture.copy(), original, 'clipboard text retains scope, special characters and repeated references')

    await fixture.select('before '.length + documentToken.length)
    await fixture.command('left')
    assert.equal(fixture.selected(), 'before '.length, 'left arrow skips the entire reference')
    await fixture.command('right')
    assert.equal(fixture.selected(), 'before '.length + documentToken.length, 'right arrow skips the entire reference')
    await fixture.command('backspace')
    assert.equal(fixture.text(), original.replace(documentToken, ''), 'Backspace removes one complete reference')
    await fixture.command('undo')
    assert.equal(fixture.text(), original)
    await fixture.command('redo')
    assert.equal(fixture.text(), original.replace(documentToken, ''))
    await fixture.command('undo')
    await fixture.select('before '.length)
    await fixture.command('delete')
    assert.equal(fixture.text(), original.replace(documentToken, ''), 'Delete removes one complete reference')
    await fixture.command('undo')

    await fixture.click('[data-document-token] button[aria-haspopup]')
    const menuItem = win.document.querySelector('[role="menuitem"]')!
    assert.equal(menuItem.textContent, '문서 #1%.md')
    await fixture.click('[role="menuitem"]')
    assert.deepEqual(JSON.parse(JSON.stringify((win as unknown as { opened: unknown[] }).opened)), [['docs', 'guides/문서 #1%.md', null]])
    await fixture.click('[data-document-token] button:not([aria-haspopup])')
    assert.equal(fixture.text(), original.replace(documentToken, ''), 'remove button edits the actual reference')
    await fixture.command('undo')
    assert.equal(fixture.text(), original)

    await fixture.cli(true)
    assert.equal(editor.querySelectorAll('[data-document-token]').length, 0, 'CLI keeps reference-shaped command text literal')
    assert.equal(editor.textContent, original)
    await fixture.cli(false)
    assert.equal(editor.querySelectorAll('[data-document-token]').length, 3)
    await fixture.reset('[[docs:guide.md]]')
    await fixture.reset('[[docs:guide-new.md]]')
    assert.equal(editor.querySelector('[data-document-token]')?.getAttribute('data-document-token'), '[[docs:guide-new.md]]', 'external edits refresh a whole tag')
    assert.equal(fixture.text(), '[[docs:guide-new.md]]')

    const titled = `before ${titledDocumentToken} after ${documentToken}`
    await fixture.reset(titled)
    assert.equal(editor.textContent, 'before Document title after ', 'titled references show their title while legacy references remain icon-only')
    assert.equal(preview.textContent, 'before Document title after ')
    assert.equal(preview.querySelectorAll('button, a').length, 0, 'titled passive tags do not nest interactive controls')
    const titleTag = editor.querySelector('[data-agent-document]')!
    assert.equal(titleTag.getAttribute('data-tip'), 'Document title', 'the full title remains available as a shared tooltip')
    assert.equal(titleTag.querySelector('button[aria-haspopup]')?.getAttribute('aria-label'), 'Document title')
    assert.equal(fixture.copy(), titled, 'copy retains the exact title and scoped path')
    await fixture.select('before '.length + titledDocumentToken.length)
    await fixture.command('left')
    assert.equal(fixture.selected(), 'before '.length, 'left arrow skips the whole titled reference')
    await fixture.command('right')
    assert.equal(fixture.selected(), 'before '.length + titledDocumentToken.length)
    await fixture.command('backspace')
    assert.equal(fixture.text(), titled.replace(titledDocumentToken, ''))
    await fixture.command('undo')
    assert.equal(fixture.text(), titled)
    await fixture.command('redo')
    assert.equal(fixture.text(), titled.replace(titledDocumentToken, ''))
    await fixture.command('undo')
    await fixture.click('[data-document-token] button[aria-haspopup] span')
    assert.equal(win.document.querySelector('[role="menuitem"]')?.textContent, '문서 #1%.md', 'clicking the title opens the original filename action')
    await fixture.click('[role="menuitem"]')
    assert.deepEqual(JSON.parse(JSON.stringify((win as unknown as { opened: unknown[] }).opened)), [
      ['docs', 'guides/문서 #1%.md', null], ['docs', 'guides/문서 #1%.md', null],
    ], 'a title never changes the navigation path')
    await fixture.click('[data-document-token] button:not([aria-haspopup])')
    assert.equal(fixture.text(), titled.replace(titledDocumentToken, ''), 'remove deletes the entire titled reference')
    await fixture.command('undo')
    assert.equal(fixture.text(), titled)
    await fixture.cli(true)
    assert.equal(editor.querySelectorAll('[data-document-token]').length, 0)
    assert.equal(editor.textContent, titled, 'CLI displays titled reference syntax literally')
    await fixture.cli(false)
    assert.equal(editor.querySelectorAll('[data-document-token]').length, 2)
    await fixture.reset('[[docs:incomplete [[docs:broken\nname.md]] [[mew-upload:pending]] [[docs:.mew/temp/assets/photo.png]]')
    assert.equal(editor.querySelectorAll('[data-document-token]').length, 0, 'incomplete references and uploads are not document tags')
  } finally {
    await fixture.destroy()
    await win.happyDOM.close()
  }
})
