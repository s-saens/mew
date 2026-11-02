import test from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'

const win = new Window({ url: 'http://localhost' })
for (const key of ['window', 'document', 'DOMParser', 'Node', 'Element', 'HTMLElement', 'Text', 'DocumentFragment', 'getComputedStyle', 'MutationObserver', 'ClipboardEvent']) {
  Object.defineProperty(globalThis, key, { value: (win as unknown as Record<string, unknown>)[key], configurable: true })
}
const { Editor } = await import('@tiptap/core')
const { NodeSelection } = await import('@tiptap/pm/state')
const { CellSelection } = await import('@tiptap/pm/tables')
const { serverEditorExtensions } = await import('../serverExtensions.ts')
const { clipboardTextSerializer } = await import('./clipboardText.ts')

function makeEditor(content: string) {
  return new Editor({
    element: document.createElement('div'),
    extensions: serverEditorExtensions().map(extension => extension.name === 'markdown'
      ? extension.configure({ transformCopiedText: false }) : extension),
    content,
    editorProps: { clipboardTextSerializer },
  })
}
type TestEditor = ReturnType<typeof makeEditor>
function copy(editor: TestEditor) { return editor.view.serializeForClipboard(editor.state.selection.content()) }
function textPosition(editor: TestEditor, text: string) {
  let position = -1
  editor.state.doc.descendants((node, pos) => { if (node.isText && node.text === text) position = pos })
  assert.ok(position >= 0, text)
  return position
}

test('Hotview copy removes syntax, preserves literal punctuation, and retains rich HTML and Markdown saves', () => {
  const editor = makeEditor('# Heading\n\n**Bold** *italic* ~~strike~~ `a_*` [Website](https://example.com) \\*literal\\*')
  try {
    const saved = editor.storage.markdown.getMarkdown()
    editor.commands.selectAll()
    const copied = copy(editor)
    assert.equal(copied.text, 'Heading\n\nBold italic strike a_* Website *literal*')
    assert.match(copied.dom.innerHTML, /<h1/)
    assert.match(copied.dom.innerHTML, /<strong>Bold<\/strong>/)
    assert.match(copied.dom.innerHTML, /href="https:\/\/example.com"/)
    assert.match(copied.dom.innerHTML, /data-pm-slice/)
    assert.equal(editor.storage.markdown.getMarkdown(), saved)
    editor.commands.setTextSelection({ from: textPosition(editor, 'Bold'), to: textPosition(editor, 'Bold') + 4 })
    assert.equal(copy(editor).text, 'Bold')
  } finally { editor.destroy() }
})

test('code block node and partial selections preserve whitespace without fences', () => {
  const editor = makeEditor('```ts\n  const x = "**literal**";\n\n\treturn x;\n```')
  try {
    editor.commands.setNodeSelection(0)
    assert.equal(copy(editor).text, '  const x = "**literal**";\n\n\treturn x;')
    editor.commands.setTextSelection({ from: 3, to: 10 })
    assert.equal(copy(editor).text, 'const x')
  } finally { editor.destroy() }
})

test('empty code selections cannot fall through to Markdown copy serialization', () => {
  const editor = makeEditor('```\n\n```')
  try {
    editor.commands.setNodeSelection(0)
    assert.equal(copy(editor).text, '')
  } finally { editor.destroy() }
})

test('paragraphs, blank paragraphs, quotes and hard breaks retain readable line boundaries', () => {
  const editor = makeEditor('first  \nsecond\n\n<br/>\n\n> quote\n>\n> next')
  try {
    editor.commands.selectAll()
    assert.equal(copy(editor).text, 'first\nsecond\n\n\n\nquote\n\nnext')
  } finally { editor.destroy() }
})

test('lists retain readable nesting, numbering and checkbox state without Markdown markers', () => {
  const editor = makeEditor('- Parent\n  - Child A\n  - Child B\n\n3. Third\n4. Fourth\n\n- [ ] Todo\n- [x] Done')
  try {
    editor.commands.selectAll()
    assert.equal(copy(editor).text, '• Parent\n  • Child A\n  • Child B\n\n3. Third\n4. Fourth\n\n☐ Todo\n☑ Done')
    editor.commands.setTextSelection({ from: textPosition(editor, 'Child A'), to: textPosition(editor, 'Child B') + 7 })
    assert.equal(copy(editor).text, '• Child A\n• Child B')
    editor.commands.setTextSelection({ from: textPosition(editor, 'Child A') + 1, to: textPosition(editor, 'Child A') + 5 })
    assert.equal(copy(editor).text, 'hild')
  } finally { editor.destroy() }
})

test('whole tables and cell ranges copy tab-separated values while a cell copies selected text', () => {
  const editor = makeEditor('| **Name** | Value |\n| --- | --- |\n| [Alpha](https://example.com) | 2 |')
  try {
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)))
    assert.equal(copy(editor).text, 'Name\tValue\nAlpha\t2')
    assert.match(copy(editor).dom.innerHTML, /<table/)
    const cells: number[] = []
    editor.state.doc.descendants((node, pos) => { if (node.type.name === 'tableCell') cells.push(pos) })
    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, cells[0], cells[1])))
    assert.equal(copy(editor).text, 'Alpha\t2')
    editor.commands.setTextSelection({ from: textPosition(editor, 'Alpha') + 1, to: textPosition(editor, 'Alpha') + 4 })
    assert.equal(copy(editor).text, 'lph')
  } finally { editor.destroy() }
})

test('images copy alt text and media copy their addresses without raw HTML', () => {
  const editor = makeEditor('![Example image](./image.png)\n\n<audio src="./sound.mp3" controls></audio>\n\n<video src="./movie.mp4" controls></video>')
  try {
    editor.commands.selectAll()
    assert.equal(copy(editor).text, 'Example image\n\n./sound.mp3\n\n./movie.mp4')
  } finally { editor.destroy() }
})

test('merged table cells keep following values in their logical spreadsheet columns and rows', () => {
  const editor = makeEditor('<table><tr><th colspan="2">Merged</th><th>Third</th></tr>'
    + '<tr><td rowspan="2">A</td><td>B</td><td>C</td></tr><tr><td>D</td><td>E</td></tr></table>')
  try {
    editor.commands.setNodeSelection(0)
    assert.equal(copy(editor).text, 'Merged\t\tThird\nA\tB\tC\n\tD\tE')
  } finally { editor.destroy() }
})

test('rich clipboard HTML preserves structure when pasted back into the editor', () => {
  const source = makeEditor('## Heading\n\n**Bold** [Link](https://example.com)\n\n- [x] Done')
  const destination = makeEditor('')
  try {
    source.commands.selectAll()
    assert.equal(destination.view.pasteHTML(copy(source).dom.innerHTML), true)
    assert.deepEqual(destination.getJSON(), source.getJSON())
  } finally { source.destroy(); destination.destroy() }
})
