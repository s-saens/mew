import test from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import { build } from 'rolldown'

const win = new Window({ url: 'http://localhost' })
const globals = win as unknown as Record<string, unknown>
for (const key of ['window', 'document', 'DOMParser', 'Node', 'Element', 'HTMLElement', 'Text', 'DocumentFragment', 'getComputedStyle', 'MutationObserver']) {
  if (key in globalThis) continue
  Object.defineProperty(globalThis, key, { configurable: true, value: globals[key] })
}

const { Editor } = await import('@tiptap/core')
const { Collaboration } = await import('@tiptap/extension-collaboration')
const { serverEditorExtensions } = await import('../serverExtensions.ts')
const { InlineVoice, inlineVoiceKey } = await import('./inlineVoice.ts')
const Y = await import('yjs')
const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { flushSync } = await import('react-dom')

type Ed = InstanceType<typeof Editor>
const source = (editor: Ed) => (editor.storage as { markdown: { getMarkdown(): string } }).markdown.getMarkdown()
const position = (editor: Ed) => inlineVoiceKey.getState(editor.state)?.find()[0]?.from

function createEditor(content = 'Before\n\nAfter', document?: InstanceType<typeof Y.Doc>, editable = true) {
  return new Editor({
    element: win.document.createElement('div'),
    extensions: [...serverEditorExtensions(), InlineVoice, ...(document ? [Collaboration.configure({ document, field: 'default' })] : [])],
    content,
    editable,
  })
}

function openWidget(editor: Ed, pos = editor.state.doc.firstChild!.nodeSize) {
  const mount = editor.view.dom.ownerDocument.createElement('span')
  mount.contentEditable = 'false'
  mount.className = 'mew-voice-mount'
  mount.textContent = 'Local recording controls'
  editor.view.dispatch(editor.state.tr.setMeta(inlineVoiceKey, { pos, mount }))
  return mount
}

test('the inline recording widget changes neither document JSON nor Markdown', () => {
  const editor = createEditor()
  try {
    const originalDocument = editor.getJSON()
    const originalSource = source(editor)
    const transactions: boolean[] = []
    editor.on('transaction', ({ transaction }) => transactions.push(transaction.docChanged))
    const mount = openWidget(editor)
    assert.equal(editor.view.dom.querySelector('.mew-voice-mount'), mount)
    assert.deepEqual(editor.getJSON(), originalDocument)
    assert.equal(source(editor), originalSource)
    assert.deepEqual(transactions, [false])
    assert.equal(editor.schema.nodes.inlineVoice, undefined)
    assert.equal(editor.schema.nodes.voiceRecording, undefined)
    assert.doesNotMatch(source(editor), /Local recording controls|mew-voice|blob:/)
  } finally { editor.destroy() }
})

test('recording controls remain local while the saved AudioNode reaches collaborators', () => {
  const document = new Y.Doc()
  const local = createEditor('', document)
  const remote = createEditor('', document)
  try {
    local.commands.setContent('Before\n\nAfter')
    const original = Y.encodeStateAsUpdate(document)
    openWidget(local)
    assert.deepEqual(Y.encodeStateAsUpdate(document), original, 'a local decoration does not write a Yjs update')
    assert.equal(remote.view.dom.querySelector('.mew-voice-mount'), null)
    assert.deepEqual(remote.getJSON(), local.getJSON())
    const pos = position(local)!
    local.chain().command(({ tr }) => { tr.setMeta(inlineVoiceKey, null); return true })
      .insertContentAt(pos, { type: 'audio', attrs: { src: '/api/asset?path=voice.webm&project=docs' } }).run()
    assert.equal(position(local), undefined)
    assert.deepEqual(remote.getJSON(), local.getJSON())
    assert.match(source(remote), /<audio src="\/api\/asset\?path=voice.webm&project=docs" controls><\/audio>/)
    assert.equal(remote.view.dom.querySelector('audio')?.getAttribute('src'), '/api/asset?path=voice.webm&project=docs')
  } finally { local.destroy(); remote.destroy(); document.destroy() }
})

test('the insertion anchor maps edits before it and ignores caret movement', () => {
  const editor = createEditor()
  try {
    const original = editor.state.doc.firstChild!.nodeSize
    openWidget(editor, original)
    editor.view.dispatch(editor.state.tr.insertText('Edited ', 1))
    assert.equal(position(editor), original + 'Edited '.length)
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    assert.equal(position(editor), original + 'Edited '.length)
    editor.view.dispatch(editor.state.tr.delete(1, 1 + 'Edited '.length))
    assert.equal(position(editor), original)
    editor.view.dispatch(editor.state.tr.insertText(' later', editor.state.doc.content.size - 1))
    assert.equal(position(editor), original)
    editor.chain().command(({ tr }) => { tr.setMeta(inlineVoiceKey, null); return true })
      .insertContentAt(position(editor)!, { type: 'audio', attrs: { src: '/voice.ogg' } }).run()
    assert.deepEqual(editor.state.doc.content.content.map(node => node.type.name), ['paragraph', 'audio', 'paragraph'])
    assert.equal(editor.state.doc.child(0).textContent, 'Before')
    assert.equal(editor.state.doc.child(2).textContent, 'After later')
    assert.equal(position(editor), undefined)
  } finally { editor.destroy() }
})

test('deleting the recording anchor removes the local widget', () => {
  const editor = createEditor()
  try {
    openWidget(editor)
    editor.view.dispatch(editor.state.tr.delete(0, editor.state.doc.content.size))
    assert.equal(position(editor), undefined)
    assert.equal(editor.view.dom.querySelector('.mew-voice-mount'), null)
    assert.doesNotMatch(source(editor), /recording|mew-voice/)
  } finally { editor.destroy() }
})

test('closing a recording removes only the decoration and preserves surrounding content', () => {
  const editor = createEditor()
  try {
    const original = source(editor)
    openWidget(editor)
    editor.view.dispatch(editor.state.tr.setMeta(inlineVoiceKey, null))
    assert.equal(position(editor), undefined)
    assert.equal(editor.view.dom.querySelector('.mew-voice-mount'), null)
    assert.equal(source(editor), original)
  } finally { editor.destroy() }
})

test('saved recording source reopens as a playable AudioNode in a read-only editor', () => {
  const markdown = 'Before\n\n<audio src="/api/asset?path=voice.m4a&project=docs" controls></audio>\n\nAfter'
  const editor = createEditor(markdown, undefined, false)
  try {
    assert.equal(editor.isEditable, false)
    const audio = editor.view.dom.querySelector('audio')
    assert.ok(audio)
    assert.equal(audio.getAttribute('src'), '/api/asset?path=voice.m4a&project=docs')
    assert.equal(audio.hasAttribute('controls'), true)
    assert.equal(position(editor), undefined)
    assert.equal(editor.view.dom.querySelector('.mew-voice-mount'), null)
    assert.equal(source(editor).trim(), markdown)
    editor.commands.setContent(source(editor))
    assert.equal(source(editor).trim(), markdown)
    assert.equal(editor.view.dom.querySelectorAll('audio').length, 1)
  } finally { editor.destroy() }
})

type VoiceProps = { signal: AbortSignal; onSave: (file: File) => Promise<void>; onCancel: () => void }
type HookModule = { useInlineVoice: typeof import('./useInlineVoice.tsx').useInlineVoice; lastVoiceProps: VoiceProps }

// Bundle only the JSX hook; keep React and the decoration key shared with this real editor.
const hookBundle = await build({
  input: 'virtual:voice-hook', write: false, platform: 'node', output: { format: 'esm' },
  transform: { jsx: 'react-jsx' },
  plugins: [{
    name: 'voice-hook-fixture',
    resolveId(id) {
      if (id.startsWith('virtual:')) return id
      if (id === './VoiceRecordingBlock') return 'virtual:recording-block'
      if (id === './inlineVoice') return { id: new URL('./inlineVoice.ts', import.meta.url).href, external: true }
      if (id === 'react' || id.startsWith('react/')) return { id: import.meta.resolve(id), external: true }
      if (id === 'react-dom') return { id: import.meta.resolve(id), external: true }
    },
    load(id) {
      if (id === 'virtual:voice-hook') return `export {useInlineVoice} from ${JSON.stringify(new URL('./useInlineVoice.tsx', import.meta.url).pathname)};export {lastVoiceProps} from 'virtual:recording-block';`
      if (id === 'virtual:recording-block') return `import {createElement} from 'react';export let lastVoiceProps;export function VoiceRecordingBlock(props){lastVoiceProps=props;return createElement('span',{'data-voice-controls':true},'Recording controls');}`
    },
  }],
})
const hookChunk = hookBundle.output.find(item => item.type === 'chunk' && item.isEntry)!
const hook = await import(`data:text/javascript;base64,${Buffer.from(hookChunk.code).toString('base64')}`) as HookModule

function hookFixture(editor: Ed, upload: (file: File) => Promise<{ url: string; name: string; mimetype: string }>) {
  const root = createRoot(win.document.createElement('div'))
  let context = {
    editor,
    path: 'first.md',
    api: { uploadAsset: upload } as import('../types.ts').EditorApi,
    readOnly: false,
  }
  let controller: ReturnType<HookModule['useInlineVoice']>
  function Harness() {
    controller = hook.useInlineVoice(context.editor, context.path, context.api, context.readOnly)
    return controller.portal
  }
  const render = () => flushSync(() => root.render(React.createElement(Harness)))
  render()
  return {
    get props() { return hook.lastVoiceProps },
    open() {
      flushSync(() => controller.open(context.editor, { from: context.editor.state.doc.firstChild!.nodeSize, to: context.editor.state.doc.firstChild!.nodeSize }))
    },
    change(change: Partial<typeof context>) { context = { ...context, ...change }; render() },
    close() { flushSync(() => root.unmount()) },
  }
}

const recordingFile = () => new File(['voice'], 'voice.webm', { type: 'audio/webm' })
const uploaded = { url: '/api/asset?path=saved.webm&project=docs', name: 'voice.webm', mimetype: 'audio/webm' }

test('the real hook uploads once and replaces its mapped widget with audio after completion', async () => {
  const editor = createEditor()
  let finish: (value: typeof uploaded) => void = () => {}
  let uploads = 0
  const fixture = hookFixture(editor, async () => { uploads++; return new Promise(resolve => { finish = resolve }) })
  try {
    fixture.open()
    const pending = fixture.props.onSave(recordingFile())
    assert.equal(uploads, 1)
    assert.equal(editor.view.dom.querySelector('audio'), null)
    assert.ok(editor.view.dom.querySelector('[data-voice-controls]'))
    editor.view.dispatch(editor.state.tr.insertText('Edited ', 1))
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    finish(uploaded)
    await pending
    assert.equal(position(editor), undefined)
    assert.equal(editor.state.doc.child(0).textContent, 'Edited Before')
    assert.equal(editor.state.doc.child(1).type.name, 'audio')
    assert.equal(editor.state.doc.child(1).attrs.src, uploaded.url)
    assert.equal(editor.state.doc.child(2).textContent, 'After')
  } finally { fixture.close(); editor.destroy() }
})

test('the real hook preserves its recording widget after upload failure and supports retry', async () => {
  const editor = createEditor()
  let uploads = 0
  const fixture = hookFixture(editor, async () => {
    if (++uploads === 1) throw new Error('Upload unavailable')
    return uploaded
  })
  try {
    fixture.open()
    const signal = fixture.props.signal
    await assert.rejects(fixture.props.onSave(recordingFile()), /Upload unavailable/)
    assert.equal(signal.aborted, false)
    assert.ok(position(editor) !== undefined)
    assert.equal(editor.view.dom.querySelector('audio'), null)
    await fixture.props.onSave(recordingFile())
    assert.equal(uploads, 2)
    assert.equal(editor.view.dom.querySelector('audio')?.getAttribute('src'), uploaded.url)
    assert.equal(signal.aborted, true)
  } finally { fixture.close(); editor.destroy() }
})

for (const change of ['path', 'api', 'readOnly', 'editor', 'anchor deletion', 'unmount'] as const) {
  test(`the real hook aborts on ${change} and ignores an upload completing afterward`, async () => {
    const editor = createEditor()
    const replacement = change === 'editor' ? createEditor('Replacement document') : undefined
    let finish: (value: typeof uploaded) => void = () => {}
    const fixture = hookFixture(editor, () => new Promise(resolve => { finish = resolve }))
    let mounted = true
    try {
      fixture.open()
      const props = fixture.props
      const pending = props.onSave(recordingFile())
      if (change === 'path') fixture.change({ path: 'second.md' })
      if (change === 'api') fixture.change({ api: { uploadAsset: async () => uploaded } as import('../types.ts').EditorApi })
      if (change === 'readOnly') { editor.setEditable(false); fixture.change({ readOnly: true }) }
      if (change === 'editor') fixture.change({ editor: replacement! })
      if (change === 'anchor deletion') editor.view.dispatch(editor.state.tr.delete(0, editor.state.doc.content.size))
      if (change === 'unmount') { fixture.close(); mounted = false }
      assert.equal(props.signal.aborted, true)
      finish(uploaded)
      await pending
      assert.equal(position(editor), undefined)
      assert.equal(editor.view.dom.querySelector('audio'), null)
      assert.equal(replacement?.view.dom.querySelector('audio') ?? null, null)
    } finally {
      if (mounted) fixture.close()
      editor.destroy()
      replacement?.destroy()
    }
  })
}

test('the real hook does not open recording controls in a read-only editor', () => {
  const editor = createEditor()
  const fixture = hookFixture(editor, async () => uploaded)
  try {
    fixture.change({ readOnly: true })
    fixture.open()
    assert.equal(position(editor), undefined)
    assert.equal(editor.view.dom.querySelector('[data-voice-controls]'), null)
    fixture.change({ readOnly: false })
    editor.setEditable(false)
    fixture.open()
    assert.equal(position(editor), undefined)
  } finally { fixture.close(); editor.destroy() }
})
