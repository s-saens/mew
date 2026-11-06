import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'rolldown'
import { Window } from 'happy-dom'

const source = `
import React from ${JSON.stringify(import.meta.resolve('react'))};
import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
import {flushSync} from ${JSON.stringify(import.meta.resolve('react-dom'))};
import {useDeviceLayout} from ${JSON.stringify(new URL('./use-device-layout.ts', import.meta.url).pathname)};
import {setBrowserStorageScope} from ${JSON.stringify(new URL('../../packages/ui/src/browser-storage-scope.ts', import.meta.url).pathname)};
setBrowserStorageScope(undefined,undefined,{storage:window.fixture.storage});
const app=createRoot(document.getElementById('root'));
function Fixture(){
  const layout=useDeviceLayout('account',window.fixture.workspace,window.fixture.compact,window.fixture.desktop);
  const[state,setState]=React.useState({dock:{stale:true},chrome:{stale:true}});
  window.fixture.edit=setState;
  React.useLayoutEffect(()=>{window.fixture.attempts.push({scope:layout.scopeKey,accepted:layout.save(state),state})},[layout.save,state]);
  React.useEffect(()=>setState(layout.restore({trees:{shared:true}})),[layout.restore]);
  window.fixture.current={scope:layout.scopeKey,restored:layout.restored,state};
  return <div><textarea defaultValue="Retained unsaved draft"/><output>{JSON.stringify(state)}</output></div>;
}
window.fixture.render=()=>flushSync(()=>app.render(<Fixture/>));
window.fixture.close=()=>flushSync(()=>app.unmount());
window.fixture.render();`
const bundle = await build({ input: 'virtual:device-layout.tsx', write: false, platform: 'browser', output: { format: 'iife' },
  transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
  plugins: [{ name: 'device-layout-fixture', resolveId: id => id === 'virtual:device-layout.tsx' ? id : undefined,
    load: id => id === 'virtual:device-layout.tsx' ? source : undefined }],
})
const code = bundle.output.find(item => item.type === 'chunk')!.code

test('retained workspaces restore presentation geometry before layout effects can save outgoing state', async t => {
  const win = new Window({ console, url: 'https://device-layout.test', settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } })
  win.document.body.innerHTML = '<div id="root"></div>'
  t.after(() => win.happyDOM.abort())
  const desktopKey = 'mew:device-layout:account:desktop', mobileKey = 'mew:device-layout:account:%2Ffirst', panelKey = 'mew:project-panel-layout:account:%2Ffirst'
  const rows = new Map<string, string>([
    [desktopKey, JSON.stringify({ dock: { ratio: .3 }, chrome: { agentOpen: true } })],
    [mobileKey, JSON.stringify({ dock: { ratio: .8 }, chrome: { terminalOpen: true } })],
    [panelKey, JSON.stringify({ dock: { ratio: .65 }, chrome: { gitOpen: true } })],
  ])
  const writes: { key: string; value: string }[] = []
  let blocked = false
  const fixture = { workspace: '/first', compact: false, desktop: true,
    attempts: [] as { scope: string; accepted: boolean; state: Record<string, unknown> }[],
    storage: { getItem(key: string) { if (blocked) throw new Error('blocked'); return rows.get(key) ?? null }, setItem(key: string, value: string) { if (blocked) throw new Error('blocked'); writes.push({ key, value }); rows.set(key, value) } },
    current: null as null | { restored: boolean; state: { dock: { ratio?: number } | null; chrome?: Record<string, unknown> } },
    render() {}, close() {}, edit(_state: Record<string, unknown>) {},
  }
  Object.assign(win, { fixture })
  win.eval(code)
  t.after(() => fixture.close())
  const waitFor = async (predicate: () => boolean) => {
    const deadline = Date.now() + 2000
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5))
    assert.ok(predicate(), 'presentation restoration settles')
  }
  const expectRatio = (ratio: number | undefined) => waitFor(() => fixture.current?.restored === true && fixture.current.state.dock?.ratio === ratio)
  await expectRatio(.3)
  const editor = win.document.querySelector('textarea')!
  editor.value = 'Draft and native selection survive'
  editor.setSelectionRange(2, 8)
  fixture.edit({ dock: { ratio: .4 }, chrome: { agentOpen: true }, trees: { shared: true } })
  await expectRatio(.4)
  const start = writes.length
  fixture.compact = true; fixture.desktop = false; fixture.render()
  await expectRatio(.65)
  assert.ok(fixture.attempts.some(attempt => !attempt.accepted && attempt.scope.includes('project-panel') && JSON.stringify(attempt.state).includes('0.4')), 'the incoming presentation rejects the outgoing layout-effect write')
  assert.equal(writes.slice(start).filter(write => write.key === panelKey).some(write => JSON.parse(write.value).dock.ratio === .4), false)
  fixture.edit({ dock: { ratio: .7 }, chrome: { gitOpen: true }, trees: { shared: true } })
  await expectRatio(.7)
  fixture.compact = false; fixture.desktop = true; fixture.render()
  await expectRatio(.4)
  assert.equal(fixture.current?.state.chrome?.agentOpen, true)
  fixture.desktop = false; fixture.render()
  await expectRatio(.8)
  assert.equal(fixture.current?.state.chrome?.terminalOpen, true)
  fixture.edit({ dock: { ratio: .9 }, chrome: { terminalOpen: true }, trees: { shared: true } })
  await expectRatio(.9)
  blocked = true
  fixture.compact = true; fixture.render()
  await expectRatio(.7)
  fixture.desktop = true; fixture.compact = false; fixture.render()
  await expectRatio(.4)
  fixture.desktop = false; fixture.render()
  await expectRatio(.9)
  assert.equal(win.document.querySelector('textarea'), editor, 'presentation restoration does not remount the editor')
  assert.equal(editor.value, 'Draft and native selection survive')
  assert.equal(editor.selectionStart, 2)
  assert.equal(editor.selectionEnd, 8)
  assert.deepEqual(JSON.parse(rows.get(desktopKey)!).dock, { ratio: .4 })
  assert.deepEqual(JSON.parse(rows.get(panelKey)!).dock, { ratio: .7 })
  assert.deepEqual(JSON.parse(rows.get(mobileKey)!).dock, { ratio: .9 })
})
