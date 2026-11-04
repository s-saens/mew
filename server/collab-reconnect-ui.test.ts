import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'rolldown'
import { connectTestBrowser } from './test-browser.ts'

test('collab recovers stalled handshakes and sync without losing local edits', { timeout: 30_000 }, async () => {
  const source = `
import React from ${JSON.stringify(import.meta.resolve('react'))};
import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
import {useCollab} from ${JSON.stringify(new URL('../src/hooks/useCollab.ts', import.meta.url).pathname)};
import * as Y from ${JSON.stringify(import.meta.resolve('yjs'))};
window.createUndo=()=>new Y.UndoManager(window.collab.ydoc.getText('draft'));
function Fixture(){
  const [path,setPath]=React.useState('file.md');
  window.changePath=setPath;
  const collab=useCollab('docs',path,'owner@example.test');
  if(path==='other.md' && collab?.ydoc===window.originalDoc) window.staleDocExposed=true;
  window.collab=collab;
  return <output>{collab?.connected ? 'connected' : 'waiting'}</output>;
}
const root=createRoot(document.getElementById('root'));
window.unmount=()=>root.unmount();
root.render(<Fixture/>);`
  const bundle = await build({
    input: 'virtual:collab.tsx', write: false, platform: 'browser', output: { format: 'esm' },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'collab-fixture', resolveId(id) { if (id === 'virtual:collab.tsx') return id }, load(id) { if (id === 'virtual:collab.tsx') return source } }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const browser = await connectTestBrowser()
  try {
    const page = await browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') })
    await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'))
    // Explicitly model a transport that never emits close, even when asked to close.
    await page.addInitScript(`
      window.sockets=[];
      window.WebSocket=class {
        static OPEN=1;
        readyState=0;sent=[];
        constructor(){window.sockets.push(this)}
        send(bytes){this.sent.push(Array.from(bytes))}
        close(){this.readyState=3}
        open(){this.readyState=1;this.onopen?.({})}
        message(bytes){this.onmessage?.({data:new Uint8Array(bytes).buffer})}
        disconnect(){this.readyState=3;this.onclose?.({})}
      };
    `)
    await page.route('http://mew-collab.test/**', route => route.fulfill(route.request().url().endsWith('/app.js')
      ? { contentType: 'text/javascript', body: chunk.code }
      : { contentType: 'text/html', body: '<div id="root"></div><script type="module" src="/app.js"></script>' }))
    await page.goto('http://mew-collab.test/')
    await page.waitForFunction('window.collab && window.sockets.length === 1')
    await page.evaluate(`(() => {
      window.originalDoc=window.collab.ydoc;
      window.undo=window.createUndo();
      window.collab.ydoc.getText('draft').insert(0,'unsent edit');
      window.lateMessage=window.sockets[0].onmessage;
    })()`)
    await page.clock.runFor(9999)
    await page.evaluate(`window.dispatchEvent(new Event('mew:remote-reconnected'))`)
    await page.clock.runFor(1)
    assert.equal(await page.evaluate('window.sockets[0].readyState'), 0, 'verified recovery keeps the connecting socket past its previous sync deadline')
    await page.clock.runFor(9998)
    assert.equal(await page.evaluate('window.sockets[0].readyState'), 0, 'the connecting socket receives a fresh ten-second sync deadline')
    await page.clock.runFor(1)
    assert.equal(await page.evaluate('window.sockets[0].readyState'), 3, 'a genuine stall still expires at the new deadline')
    await page.clock.runFor(300)
    assert.equal(await page.evaluate('window.sockets.length'), 2, 'a stalled CONNECTING socket must retry without waiting for close')
    await page.evaluate(`(() => {
      window.lateMessage({data:new Uint8Array([0,1,2,0,0]).buffer});
      window.sockets[1].open();
      window.sockets[1].message([0,0,1,0]);
    })()`)
    assert.equal(await page.evaluate('window.collab.synced'), false, 'late responses and syncStep1 must not complete initial sync')
    await page.clock.runFor(9999)
    await page.evaluate(`window.dispatchEvent(new Event('mew:remote-reconnected'))`)
    await page.clock.runFor(1)
    assert.equal(await page.evaluate('window.sockets[1].readyState'), 1, 'an open socket awaiting its first document response also keeps its connection on verified recovery')
    await page.clock.runFor(10_600)
    assert.equal(await page.evaluate('window.sockets.length'), 3, 'an open socket with no document response must also retry')
    await page.evaluate(`window.dispatchEvent(new Event('mew:remote-reconnected'))`)
    assert.equal(await page.evaluate('window.sockets.length'), 3, 'verified recovery cannot replace a socket that is already connecting')
    await page.evaluate(`window.sockets[2].disconnect();window.dispatchEvent(new Event('online'));
      window.collab.ydoc.getText('draft').insert(11,' while disconnected')`)
    assert.equal(await page.evaluate('window.sockets.length'), 3, 'network availability does not bypass verified Mewlink readiness')
    for (const count of [4, 5, 6]) {
      await page.evaluate(`window.dispatchEvent(new Event('mew:remote-reconnected'));window.dispatchEvent(new Event('mew:remote-reconnected'))`)
      assert.equal(await page.evaluate('window.sockets.length'), count, 'verified recovery opens exactly one socket without advancing its pending backoff')
      assert.equal(await page.evaluate('window.sockets.at(-1).sent.length'), 0, 'recovery never replays application operations before the new socket opens')
      if (count < 6) await page.evaluate('window.sockets.at(-1).disconnect()')
    }
    await page.clock.runFor(3000)
    assert.equal(await page.evaluate('window.sockets.length'), 6, 'the canceled three-second retry cannot open a duplicate socket')
    await page.evaluate('window.sockets[5].open(); window.sockets[5].message([0,1,2,0,0])')
    await page.getByText('connected', { exact: true }).waitFor()
    assert.equal(await page.evaluate('window.collab.ydoc === window.originalDoc'), true)
    assert.equal(await page.evaluate("window.collab.ydoc.getText('draft').toString()"), 'unsent edit while disconnected')
    await page.evaluate(`window.dispatchEvent(new Event('mew:remote-reconnected'));window.undo.undo()`)
    assert.equal(await page.evaluate('window.sockets.length'), 6, 'verified recovery cannot replace an open synchronized socket')
    assert.equal(await page.evaluate("window.collab.ydoc.getText('draft').toString()"), 'unsent edit')
    await page.evaluate('window.undo.redo()')
    assert.equal(await page.evaluate("window.collab.ydoc.getText('draft').toString()"), 'unsent edit while disconnected', 'the same undo history survives reconnection')
    await page.clock.runFor(30_000)
    assert.equal(await page.evaluate('window.sockets.length'), 6, 'successful sync cancels the deadline')
    await page.evaluate('window.sockets[5].disconnect()')
    await page.clock.runFor(300)
    assert.equal(await page.evaluate('window.sockets.length'), 7, 'successful sync resets the reconnect backoff')
    await page.evaluate("window.changePath('other.md')")
    await page.waitForFunction('window.sockets.length === 8')
    assert.equal(await page.evaluate('window.staleDocExposed === true'), false, 'a new path must never receive the previous room document, including the render before effects')
    assert.equal(await page.evaluate('window.originalDoc.isDestroyed'), true, 'path changes retire the previous document')
    await page.evaluate(`window.sockets[7].disconnect();window.unmount();window.dispatchEvent(new Event('mew:remote-reconnected'))`)
    await page.clock.runFor(20_000)
    assert.equal(await page.evaluate('window.sockets.length'), 8, 'unmount cancels pending retries and removes the verified recovery listener')
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
