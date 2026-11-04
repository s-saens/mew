import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { Window } from 'happy-dom'
import { build } from 'rolldown'
import ts from 'typescript'

function headerKeys(source: string) {
  const app = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const keys = new Map<string, string>()
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) && ['HeaderResources', 'LayoutPresets'].includes(node.tagName.getText(app))) {
      const key = node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(app) === 'key')
      assert.ok(key && ts.isJsxAttribute(key) && key.initializer && ts.isJsxExpression(key.initializer) && key.initializer.expression)
      keys.set(node.tagName.getText(app), key.initializer.expression.getText(app))
    }
    ts.forEachChild(node, visit)
  }
  visit(app)
  assert.equal(keys.size, 2, 'The fixture must use both resource and layout identities from App')
  return keys
}

test('header resources stay singleton across account changes and conditional layout controls', async () => {
  const keys = headerKeys(await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'))
  const source = `
import React, {act} from ${JSON.stringify(import.meta.resolve('react'))};
import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
import {HeaderResources} from ${JSON.stringify(new URL('../src/components/header-resources.tsx', import.meta.url).pathname)};
window.IS_REACT_ACT_ENVIRONMENT=true;
window.requests=[];
window.activePolls=new Set();
let timer=0;
window.setInterval=()=>{const id=++timer;window.activePolls.add(id);return id;};
window.clearInterval=id=>window.activePolls.delete(id);
function LayoutPresets(){return <button data-layout-presets>Layouts</button>;}
const root=createRoot(document.getElementById('root'));
window.fixture={
  render:({authEmail,layouts,resources=true})=>act(async()=>{
    root.render(<header>
      {resources&&<HeaderResources key={${keys.get('HeaderResources')}} onOpen={()=>{}}/>}
      <span data-runtime-controls/>
      {authEmail&&<button data-active-sessions>Sessions</button>}
      {layouts&&<LayoutPresets key={${keys.get('LayoutPresets')}}/>}
      <button data-menu>Menu</button>
    </header>);
  }),
  destroy:()=>act(async()=>root.unmount())
};`
  const bundle = await build({
    input: 'virtual:header-resource-identity.tsx', write: false, platform: 'browser',
    output: { format: 'iife', codeSplitting: false },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{
      name: 'header-resource-identity',
      resolveId(id, importer) {
        if (id === 'virtual:header-resource-identity.tsx') return id
        if (importer?.endsWith('/header-resources.tsx')) {
          if (id === '../api/client') return 'virtual:resource-api'
          if (id === '../i18n') return 'virtual:resource-i18n'
          if (id === '@mew/ui') return 'virtual:resource-tooltip'
        }
      },
      load(id) {
        if (id === 'virtual:header-resource-identity.tsx') return source
        if (id === 'virtual:resource-api') return `export async function fetchSystemStats(signal){window.requests.push({signal});return {cpu:{usage:12},memory:{used:1,total:2},gpus:[{utilization:34}]};}`
        if (id === 'virtual:resource-i18n') return `export function useI18n(){return {t:key=>key};}`
        if (id === 'virtual:resource-tooltip') return `export function HoverTipLayer({children}){return children;}`
      },
    }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk')
  assert.ok(chunk)
  const win = new Window({ url: 'http://header-resource-identity.test/' })
  win.console.timeStamp = () => {}
  Object.assign(win, { MessageChannel: class {
    port1 = { onmessage: null as (() => void) | null }
    port2 = { postMessage: () => { setTimeout(() => this.port1.onmessage?.(), 0) } }
  } })
  const errors: string[] = []
  win.console.error = (...args: unknown[]) => errors.push(args.map(String).join(' '))
  win.addEventListener('error', event => errors.push('message' in event ? String(event.message) : event.type))
  win.document.body.innerHTML = '<div id="root"></div>'
  win.eval(chunk.code)
  const state = win as unknown as {
    requests: { signal: { aborted: boolean } }[]
    activePolls: Set<number>
    fixture: {
      render(options: { authEmail: string | null; layouts: boolean; resources?: boolean }): Promise<void>
      destroy(): Promise<void>
    }
  }
  try {
    for (const authEmail of ['owner@example.test', 'other@example.test', null, 'owner@example.test', 'other@example.test', 'owner@example.test']) {
      for (const layouts of [true, false, true]) {
        await state.fixture.render({ authEmail, layouts })
        assert.equal(win.document.querySelectorAll('button[aria-label="mewcat.system"]').length, 1, 'Account and layout transitions cannot leave orphan resource buttons')
        assert.equal(win.document.querySelectorAll('[data-layout-presets]').length, Number(layouts))
        assert.equal(win.document.querySelectorAll('[data-menu]').length, 1)
        assert.equal(state.activePolls.size, 1, 'Only the mounted resource control may poll')
        assert.ok(state.requests.slice(0, -1).every(request => request.signal.aborted), 'Prior accounts release their resource requests')
        assert.equal(state.requests.at(-1)?.signal.aborted, false)
        assert.equal(win.document.querySelector('[aria-describedby]')?.getAttribute('aria-describedby'), win.document.querySelector('.sr-only')?.id)
        assert.equal(win.document.querySelector('.sr-only')?.textContent, 'CPU 12% · RAM 50% · GPU 34%')
      }
    }
    await state.fixture.render({ authEmail: 'owner@example.test', layouts: true, resources: false })
    assert.equal(win.document.querySelectorAll('button[aria-label="mewcat.system"]').length, 0, 'Removing the system capability removes all resource controls')
    assert.equal(state.activePolls.size, 0)
    assert.ok(state.requests.every(request => request.signal.aborted))
    await state.fixture.render({ authEmail: 'owner@example.test', layouts: true })
    assert.equal(win.document.querySelectorAll('button[aria-label="mewcat.system"]').length, 1)
    assert.equal(state.activePolls.size, 1)
    await state.fixture.destroy()
    assert.equal(win.document.querySelector('#root')?.childElementCount, 0)
    assert.equal(state.activePolls.size, 0)
    assert.ok(state.requests.every(request => request.signal.aborted))
    assert.deepEqual(errors, [], 'Reconciliation must not emit duplicate-key warnings or runtime errors')
  } finally {
    await state.fixture.destroy()
    await win.happyDOM.abort()
    win.close()
  }
})
