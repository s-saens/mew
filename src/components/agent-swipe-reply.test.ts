import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'rolldown'
import { Window } from 'happy-dom'

const source = `import React from ${JSON.stringify(import.meta.resolve('react'))};
import {createRoot} from ${JSON.stringify(import.meta.resolve('react-dom/client'))};
import {flushSync} from ${JSON.stringify(import.meta.resolve('react-dom'))};
import {AgentSwipeReply, quoteAgentReply} from ${JSON.stringify(new URL('./agent-swipe-reply.tsx', import.meta.url).pathname)};
const root=createRoot(document.getElementById('root'));
window.fixture.quote=quoteAgentReply;
flushSync(()=>root.render(<AgentSwipeReply label="Reply" text="first\\nsecond" onReply={text=>window.fixture.replies.push(text)}><button data-bubble>Message</button></AgentSwipeReply>));
window.fixture.close=()=>flushSync(()=>root.unmount());`
const bundle = await build({ input: 'virtual:reply.tsx', write: false, platform: 'browser', output: { format: 'iife' },
  transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
  plugins: [{ name: 'fixture', resolveId(id) { if (id === 'virtual:reply.tsx') return id }, load(id) { if (id === 'virtual:reply.tsx') return source } }] })
const chunk = bundle.output.find(item => item.type === 'chunk')!

test('reply gesture requires a leftward horizontal swipe and preserves draft in quote', async () => {
  const win = new Window({ url: 'https://reply.test', console, settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } })
  win.document.body.innerHTML = '<div id="root"></div>'
  const fixture = { replies: [] as string[], quote: (_text: string, _draft: string) => '', close: () => {} }
  Object.assign(win, { fixture })
  win.eval(chunk.code)
  const wrapper = win.document.querySelector('[data-agent-swipe-reply]')! as HTMLElement
  wrapper.setPointerCapture = () => {}
  const bubble = win.document.querySelector('[data-bubble]')!
  const drag = (x: number, y: number) => {
    for (const [type, px, py] of [['pointerdown', 100, 100], ['pointermove', x, y], ['pointerup', x, y]] as const) {
      bubble.dispatchEvent(new win.PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, clientX: px, clientY: py }))
    }
  }
  try {
    drag(45, 102)
    assert.deepEqual(fixture.replies, ['first\\nsecond'])
    drag(160, 100)
    drag(50, 160)
    drag(70, 100)
    assert.equal(fixture.replies.length, 1)
    assert.equal(fixture.quote(' first\n\nsecond ', 'existing draft'), '> first\n> \n> second\n\nexisting draft')
    ;(win.document.querySelector('[data-agent-reply-button]') as HTMLElement).click()
    assert.equal(fixture.replies.length, 2)
  } finally { fixture.close(); await win.happyDOM.close() }
})
