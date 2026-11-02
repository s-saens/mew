import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'rolldown'
import { readFile } from 'node:fs/promises'

test('the pane, Plain editor and agent composer preserve independent editor-engine boundaries', async () => {
  const pane = new URL('./EditorPane.tsx', import.meta.url).pathname
  const plain = new URL('./CodePane.tsx', import.meta.url).pathname
  const rich = new URL('../../packages/editor/src/Editor.tsx', import.meta.url).pathname
  const agent = new URL('./AgentPanel.tsx', import.meta.url).pathname
  const mention = new URL('./MentionTextarea.tsx', import.meta.url).pathname
  const result = await build({ input: [pane, agent], write: false, platform: 'browser', onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) }, transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('production') } }, output: { format: 'esm' }, plugins: [{ name: 'editor-boundary-styles', resolveId(id) { if (id.endsWith('.css')) return 'virtual:style' }, async load(id) { if (id === 'virtual:style') return ''; if (id.endsWith('?raw')) return 'export default ' + JSON.stringify(await readFile(id.slice(0, -4), 'utf8')) } }] })
  const chunks = result.output.filter(chunk => chunk.type === 'chunk')
  const owner = new Map(chunks.flatMap(chunk => Object.keys(chunk.modules).map(id => [id, chunk] as const)))
  const closure = (module: string) => {
    const chunk = owner.get(module)
    assert.ok(chunk, `missing actual source module: ${module}`)
    const files = new Set<string>()
    const visit = (file: string) => {
      if (files.has(file)) return
      files.add(file)
      const current = chunks.find(chunk => chunk.fileName === file)!
      for (const dependency of current.imports) visit(dependency)
    }
    visit(chunk.fileName)
    return new Set(chunks.filter(chunk => files.has(chunk.fileName)).flatMap(chunk => Object.keys(chunk.modules)))
  }
  const paneModules = closure(pane), plainModules = closure(plain), richModules = closure(rich)
  assert.equal(paneModules.has(plain) || paneModules.has(rich), false)
  assert.equal(paneModules.has(new URL('./DatabaseListModal.tsx', import.meta.url).pathname), false, 'the closed database picker stays deferred')
  assert.deepEqual([...paneModules].filter(id => /\/(?:@tiptap|@codemirror|@lezer|prosemirror-[^/]+)\//.test(id)), [])
  assert.equal(plainModules.has(rich), false)
  assert.deepEqual([...plainModules].filter(id => /\/(?:@tiptap|prosemirror-[^/]+)\//.test(id)), [])
  assert.equal(richModules.has(plain), false)
  assert.deepEqual([...richModules].filter(id => /\/(?:@codemirror|@lezer)\//.test(id)), [])
  assert.ok([...plainModules].some(id => id.includes('/@codemirror/view/')))
  assert.deepEqual([...plainModules].filter(id => /\/(?:@codemirror\/lang-[^/]+|@codemirror\/legacy-modes|@lezer\/(?:javascript|css|html|markdown|json|yaml|python|rust|sql|go|xml))\//.test(id)), [], 'Plain loads its selected parser independently from the editor engine')
  assert.ok([...richModules].some(id => id.includes('/@tiptap/core/')))
  const agentModules = closure(agent)
  assert.equal(agentModules.has(rich), false, 'the agent panel must not import the Hotview editor through type-only barrel imports')
  assert.deepEqual([...agentModules].filter(id => /\/(?:@tiptap|prosemirror-[^/]+)\//.test(id)), [], 'loading the agent composer must not download the unrelated Hotview engine')
  assert.deepEqual([...agentModules].filter(id => /\/(?:@codemirror|@lezer)\//.test(id)), [], 'loading the background agent panel must not evaluate the closed composer editor')
  assert.deepEqual([...agentModules].filter(id => id.includes('/@xterm/') || /\/TmuxTerminal(?:Panel)?\.tsx$/.test(id)), [], 'restoring background agent sessions must not download the closed terminal renderer')
  assert.deepEqual([...closure(mention)].filter(id => /\/(?:@codemirror|@lezer)\//.test(id)), [], 'the native mention textarea keeps the image-capable composer behind its own boundary')
})
