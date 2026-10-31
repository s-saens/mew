import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'rolldown'
import { chromium } from 'playwright-core'
import { domBrowserExecutable } from './browser-dom-executable.ts'

test('Undo preserves loaded files and external refreshes while reverting local edits', { skip: !domBrowserExecutable(), timeout: 60_000 }, async t => {
  const content = '# Saved document\n\nKeep this body.'
  const refreshed = '# Refreshed document\n\nKeep the external changes.'
  const source = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import * as Y from 'yjs';
import {Awareness} from 'y-protocols/awareness';
import {EditorView} from '@codemirror/view';
import {CodePane} from ${JSON.stringify(new URL('../src/components/CodePane.tsx', import.meta.url).pathname)};
import {Editor} from ${JSON.stringify(new URL('../packages/editor/src/Editor.tsx', import.meta.url).pathname)};
const params=new URLSearchParams(location.search);
const ydoc=new Y.Doc(),awareness=new Awareness(ydoc);
const api={db:{},fetchTableLayout:async()=>[]};
const collab=params.has('collab')?{ydoc,awareness,synced:true,connected:true}:null;
function Fixture(){
 const [value,setValue]=React.useState(${JSON.stringify(content)});
 window.value=value;window.replaceValue=setValue;
 window.codeView=()=>EditorView.findFromDOM(document.querySelector('.cm-editor'));
 const props={value,onChange:setValue,path:params.has('code')?'fixture.ts':'fixture.md',collab,showMobileKeyBar:true};
 return <main style={{height:600}}>{params.has('hotview')?<Editor {...props} api={api}/>:<CodePane {...props}/>}</main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);`
  const bundle = await build({
    input: 'virtual:undo-baseline.tsx', write: false, platform: 'browser', output: { format: 'esm', codeSplitting: false },
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{
      name: 'undo-baseline-fixture',
      resolveId(id) { if (id === 'virtual:undo-baseline.tsx') return id },
      load(id) {
        if (id === 'virtual:undo-baseline.tsx') return source
        if (id.endsWith('.css')) return { code: '', moduleType: 'js' }
      },
    }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk' && item.isEntry)!
  assert.ok(chunk.type === 'chunk')
  const browser = await chromium.launch({ executablePath: domBrowserExecutable(), chromiumSandbox: true })
  try {
    for (const mode of ['Plain', 'Code', 'Hotview']) for (const collaborative of [false, true]) {
      const hotview = mode === 'Hotview'
      await t.test(`${mode} ${collaborative ? 'collaborative' : 'standalone'}`, async () => {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
        page.setDefaultTimeout(5000)
        try {
          const errors: string[] = []
          page.on('pageerror', error => errors.push(error.message))
          await page.route('http://mew-undo.test/**', route => route.fulfill(route.request().url().endsWith('/app.js')
            ? { contentType: 'text/javascript', body: chunk.code }
            : route.request().url().includes('/api/') ? { json: [] }
            : { contentType: 'text/html', body: '<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/app.js"></script></html>' }))
          await page.goto(`http://mew-undo.test/?${hotview ? 'hotview&' : mode === 'Code' ? 'code&' : ''}${collaborative ? 'collab' : ''}`)
          const editor = page.locator(hotview ? '.ProseMirror' : '.cm-content')
          await editor.filter({ hasText: 'Keep this body.' }).waitFor()
          const settle = () => page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
          const action = async (kind: 'undo' | 'redo') => {
            await page.getByRole('button', { name: kind === 'undo' ? /^(Undo|되돌리기)$/ : /^(Redo|다시 실행)$/ }).click()
            await settle()
          }
          const body = () => editor.innerText()
          const initial = await body()
          await action('undo')
          assert.equal(await body(), initial, 'Undo on a loaded file cannot erase its initial contents')
          assert.equal(await page.evaluate('window.value'), content)
          await page.evaluate(`(() => {
            ${hotview
              ? "const ed=document.querySelector('.ProseMirror').editor;ed.commands.insertContentAt(ed.state.doc.content.size,' Local edit.');"
              : "const view=window.codeView();view.dispatch({changes:{from:view.state.doc.length,insert:' Local edit.'},userEvent:'input.type'});"}
          })()`)
          await settle()
          const edited = await body()
          assert.ok(edited.includes('Local edit.'))
          await action('undo')
          assert.equal(await body(), initial, 'Undo removes only the local edit, even immediately after loading')
          await action('undo')
          assert.equal(await body(), initial, 'repeated Undo stops at the loaded baseline')
          await action('redo')
          assert.equal(await body(), edited, 'Redo restores the local edit')
          if (!collaborative) {
            await page.evaluate(value => (globalThis as any).replaceValue(value), refreshed)
            await editor.filter({ hasText: 'Keep the external changes.' }).waitFor()
            const external = await body()
            await action('undo')
            assert.equal(await body(), external, 'Undo cannot replace a refreshed file with a stale buffer')
          }
          assert.deepEqual(errors, [])
        } finally { await page.close() }
      })
    }
  } finally { await browser.close() }
})
