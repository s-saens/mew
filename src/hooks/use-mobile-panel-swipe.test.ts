import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'rolldown'
import { Window } from 'happy-dom'

const source = `import React from ${JSON.stringify(import.meta.resolve('react'))};
import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
import {flushSync} from ${JSON.stringify(import.meta.resolve('react-dom'))};
import {useMobilePanelSwipe} from ${JSON.stringify(new URL('./use-mobile-panel-swipe.ts', import.meta.url).pathname)};
const root=createRoot(document.getElementById('root'));
function Fixture({enabled}) {
  const ref=useMobilePanelSwipe((panel,direction)=>window.fixture.swipes.push({panel,direction}),enabled);
  return enabled?<div ref={ref} data-test-host><div data-workspace-panel="sidebar"><button data-test-target>Files</button></div></div>:null;
}
window.fixture.render=enabled=>flushSync(()=>root.render(<Fixture enabled={enabled}/>));
window.fixture.close=()=>flushSync(()=>root.unmount());
window.fixture.render(false);`
const bundle = await build({
  input: 'virtual:mobile-panel-swipe.tsx', write: false, platform: 'browser', output: { format: 'iife' },
  transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
  plugins: [{
    name: 'mobile-panel-swipe-fixture',
    resolveId(id) { if (id === 'virtual:mobile-panel-swipe.tsx') return id },
    load(id) { if (id === 'virtual:mobile-panel-swipe.tsx') return source },
  }],
})
const chunk = bundle.output.find(item => item.type === 'chunk')!

test('mobile panel swipes attach after delayed workspace mount and reattach after project setup', async () => {
  const win = new Window({ url: 'https://mobile-project-setup.test', width: 390, height: 700, console,
    settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } })
  win.document.body.innerHTML = '<div id="root"></div>'
  const fixture = { swipes: [] as { panel: string; direction: number }[], render: (_enabled: boolean) => {}, close: () => {} }
  Object.assign(win, { fixture })
  win.eval(chunk.code)
  const settle = () => new Promise(resolve => setTimeout(resolve, 0))
  const swipe = (direction: -1 | 1) => {
    const target = win.document.querySelector('[data-test-target]')!
    win.document.elementFromPoint = () => target
    const touch = (x: number) => ({ identifier: 1, clientX: x, clientY: 100 })
    const dispatch = (type: string, touches: ReturnType<typeof touch>[], changedTouches: ReturnType<typeof touch>[]) => {
      const event = new win.Event(type, { bubbles: true, cancelable: true })
      Object.assign(event, { touches, changedTouches })
      target.dispatchEvent(event)
    }
    const start = touch(150), end = touch(150 - direction * 60)
    dispatch('touchstart', [start], [start])
    dispatch('touchmove', [end], [end])
    dispatch('touchend', [], [end])
  }
  try {
    await settle()
    assert.equal(win.document.querySelector('[data-test-host]'), null, 'startup has no workspace host')
    fixture.render(true)
    await settle()
    swipe(1)
    assert.deepEqual(fixture.swipes.map(swipe => ({ ...swipe })), [{ panel: 'sidebar', direction: 1 }], 'listeners attach when the initial workspace becomes available')

    const previousHost = win.document.querySelector('[data-test-host]')!
    const removed: string[] = []
    const remove = previousHost.removeEventListener.bind(previousHost)
    previousHost.removeEventListener = (type, listener, options) => { removed.push(type); remove(type, listener, options) }
    fixture.render(false)
    await settle()
    assert.deepEqual(removed.sort(), ['click', 'pointerdown', 'touchcancel', 'touchend', 'touchmove', 'touchstart'], 'leaving the workspace removes gesture listeners')

    fixture.render(true)
    await settle()
    assert.notEqual(win.document.querySelector('[data-test-host]'), previousHost)
    swipe(-1)
    assert.deepEqual(fixture.swipes.map(swipe => ({ ...swipe })), [{ panel: 'sidebar', direction: 1 }, { panel: 'sidebar', direction: -1 }], 'new workspace host receives one swipe handler after a project is added')
  } finally {
    fixture.close()
    await win.happyDOM.close()
  }
})
