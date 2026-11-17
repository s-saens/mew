import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'rolldown'
import { Window } from 'happy-dom'

const source = `import React,{act} from ${JSON.stringify(import.meta.resolve('react'))};
import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
import {ProjectCatalogPanel} from ${JSON.stringify(new URL('./project-catalog-panel.tsx', import.meta.url).pathname)};
import {I18nProvider} from ${JSON.stringify(new URL('../i18n.tsx', import.meta.url).pathname)};
window.IS_REACT_ACT_ENVIRONMENT=true;
const root=createRoot(document.getElementById('root'));
let finishFull, finishSnapshot, fullSignal;
window.opened=[];
window.fetch=(input,init)=>new Promise(resolve=>{
  const deliver=projects=>resolve(new Response(JSON.stringify({projects}),{headers:{'Content-Type':'application/json'}}));
  if(String(input).includes('snapshot=1')) finishSnapshot=deliver; else { finishFull=deliver; fullSignal=init.signal; }
});
window.fixture={mount:()=>act(async()=>root.render(<I18nProvider><ProjectCatalogPanel selection paths={[]} onOpen={path=>window.opened.push(path)}/></I18nProvider>)),
  snapshot:projects=>act(async()=>finishSnapshot(projects)), full:projects=>act(async()=>finishFull(projects)),
  select:()=>act(async()=>document.querySelector(".mew-project-catalog-open").click()),
  canceled:()=>fullSignal.aborted, opened:()=>window.opened, close:()=>act(async()=>root.unmount())};`
const bundle = await build({ input: 'virtual:catalog.tsx', write: false, platform: 'browser', output: { format: 'iife' },
  transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
  onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) },
  plugins: [{ name: 'fixture', resolveId(id) { if (id === 'virtual:catalog.tsx') return id; if (id.endsWith('.css')) return 'virtual:style' },
    load(id) { if (id === 'virtual:catalog.tsx') return source; if (id === 'virtual:style') return '' } }] })
const chunk = bundle.output.find(item => item.type === 'chunk')!
const project = (name: string) => ({ path: `/${name}`, name, managed: false, mine: false, icon: null })

test('catalog shows saved rows while discovery is pending and ignores a late snapshot', async () => {
  for (const first of ['snapshot', 'full'] as const) {
    const win = new Window({ url: 'https://catalog.test', console, settings: { disableErrorCapturing: true } })
    class TestMessageChannel {
      port1: { onmessage: (() => void) | null } = { onmessage: null }
      port2 = { postMessage: () => setTimeout(() => this.port1.onmessage?.(), 0) }
    }
    Object.assign(win, { MessageChannel: TestMessageChannel })
    win.document.body.innerHTML = '<div id="root"></div>'
    win.eval(chunk.code)
    const fixture = (win as unknown as { fixture: { mount(): Promise<void>; snapshot(value: unknown): Promise<void>; full(value: unknown): Promise<void>; close(): Promise<void> } }).fixture
    try {
      await fixture.mount()
      if (first === 'snapshot') {
        await fixture.snapshot([project('saved')])
        assert.ok(win.document.querySelector('[data-catalog-project="/saved"]'))
        await fixture.full([project('saved'), project('discovered')])
      } else {
        await fixture.full([project('saved'), project('discovered')])
        await fixture.snapshot([project('saved')])
      }
      assert.ok(win.document.querySelector('[data-catalog-project="/discovered"]'))
    } finally { await fixture.close(); win.happyDOM.abort() }
  }
})

test('selecting a saved project cancels discovery and opens it immediately', async () => {
  const win = new Window({ url: 'https://catalog.test', console, settings: { disableErrorCapturing: true } })
  class TestMessageChannel {
    port1: { onmessage: (() => void) | null } = { onmessage: null }
    port2 = { postMessage: () => setTimeout(() => this.port1.onmessage?.(), 0) }
  }
  Object.assign(win, { MessageChannel: TestMessageChannel })
  win.document.body.innerHTML = '<div id="root"></div>'
  win.eval(chunk.code)
  const fixture = (win as unknown as { fixture: { mount(): Promise<void>; snapshot(value: unknown): Promise<void>; select(): Promise<void>; canceled(): boolean; opened(): string[]; close(): Promise<void> } }).fixture
  try {
    await fixture.mount()
    await fixture.snapshot([project('saved')])
    await fixture.select()
    assert.equal(fixture.canceled(), true)
    assert.deepEqual(Array.from(fixture.opened()), ['/saved'])
  } finally { await fixture.close(); win.happyDOM.abort() }
})
