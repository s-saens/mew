import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { build } from 'rolldown'
import { Window, type HTMLButtonElement, type HTMLInputElement } from 'happy-dom'

const root = path.resolve(import.meta.dirname, '..')

test('relative schedule input validates durations, confirms from submission time and preserves retry state', async () => {
  const source = `import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {AgentScheduleInput} from '${root}/src/components/agent-schedule-input.tsx';
import {I18nProvider} from '${root}/src/i18n.tsx';
window.IS_REACT_ACT_ENVIRONMENT = true;
localStorage.setItem('mew:locale', 'ko');
window.reducedMotion = false;
const matchMedia = window.matchMedia.bind(window);
window.matchMedia = query => query === '(prefers-reduced-motion: reduce)' ? {matches: window.reducedMotion} : matchMedia(query);
window.motionCalls = [];
Element.prototype.animate = function(frames, options) {
  const record = {target: this.getAttribute('aria-label'), frames, options, canceled: false};
  window.motionCalls.push(record);
  return {cancel: () => {record.canceled = true;}};
};
const host = document.getElementById('root'), root = createRoot(host);
let generation = 0, mode = 'success', resolveSave, rejectSave;
window.calls = []; window.closed = 0; window.outerKeys = [];
window.fixture = {
  mount: props => act(async () => {
    generation++; window.calls = []; window.closed = 0; window.outerKeys = []; window.motionCalls = [];
    root.render(<I18nProvider><div onKeyDown={event => window.outerKeys.push(event.key)}>
      <AgentScheduleInput key={generation} {...props}
        onClose={() => window.closed++}
        onConfirm={at => {
          window.calls.push(at);
          if (mode === 'pending') return new Promise((resolve, reject) => { resolveSave = resolve; rejectSave = reject; });
          if (mode === 'error') return Promise.reject(new Error('Schedule failed'));
          return Promise.resolve();
        }}/>
    </div></I18nProvider>);
  }),
  set: (label, value) => act(async () => {
    const input = host.querySelector('input[aria-label="' + label + '"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
  }),
  click: label => act(async () => host.querySelector('button[aria-label="' + label + '"]').click()),
  key: (label, key) => act(async () => host.querySelector('input[aria-label="' + label + '"]').dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true}))),
  submit: () => act(async () => host.querySelector('form').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))),
  mode: value => { mode = value; },
  finish: error => act(async () => { if (error) rejectSave(new Error(error)); else resolveSave(); }),
  destroy: () => act(async () => root.unmount()),
};`
  const bundle = await build({
    input: 'virtual:agent-schedule.tsx', write: false, platform: 'browser',
    output: { format: 'iife', codeSplitting: false },
    onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning) },
    transform: { jsx: 'react-jsx', define: { 'process.env.NODE_ENV': JSON.stringify('test') } },
    plugins: [{ name: 'agent-schedule', resolveId(id) { if (id === 'virtual:agent-schedule.tsx') return id }, load(id) {
      if (id === 'virtual:agent-schedule.tsx') return source
      if (id.endsWith('.css')) return { code: '', moduleType: 'js' }
    } }],
  })
  const chunk = bundle.output.find(item => item.type === 'chunk'); assert.ok(chunk)
  const win = new Window({ url: 'http://agent-schedule.test' })
  win.console.timeStamp = () => {}
  Object.assign(win, { MessageChannel: class {
    port1 = { onmessage: null as (() => void) | null }
    port2 = { postMessage: () => { setTimeout(() => this.port1.onmessage?.(), 0) } }
  } })
  win.document.body.innerHTML = '<div id="root"></div>'
  let now = Date.parse('2026-11-04T12:34:45Z')
  win.Date.now = () => now
  win.eval(chunk.code)
  const state = win as unknown as {
    calls: string[]; closed: number; outerKeys: string[]; reducedMotion: boolean
    motionCalls: { target: string; frames: { opacity: number; transform?: string; clipPath?: string }[]; options: { duration: number; easing: string }; canceled: boolean }[]
    fixture: {
      mount(props?: { disabled?: boolean; initialAt?: string }): Promise<void>
      set(label: string, value: string): Promise<void>; click(label: string): Promise<void>
      key(label: string, key: string): Promise<void>; submit(): Promise<void>
      mode(value: string): void; finish(error?: string): Promise<void>; destroy(): Promise<void>
    }
  }
  const fixture = state.fixture
  const hours = () => win.document.querySelector<HTMLInputElement>('input[aria-label="시간"]')!
  const minutes = () => win.document.querySelector<HTMLInputElement>('input[aria-label="분"]')!
  const confirm = () => win.document.querySelector<HTMLButtonElement>('button[aria-label="확인"]')!
  try {
    await fixture.mount({ disabled: false })
    const form = win.document.querySelector('form[aria-label="예약 전송"]')
    assert.ok(form)
    const entrance = state.motionCalls[0]
    assert.equal(state.motionCalls.length, 1)
    assert.equal(entrance.target, '예약 전송')
    assert.equal(entrance.options.duration, 240)
    assert.equal(entrance.options.easing, 'cubic-bezier(0.16, 1, 0.3, 1)')
    assert.equal(entrance.frames[0].transform, 'translateX(6px)')
    assert.match(entrance.frames[0].clipPath!, /100% - 2rem/, 'reveal grows from the clock side')
    assert.equal(entrance.frames[1].opacity, 1)
    assert.equal(win.document.activeElement?.getAttribute('aria-label'), '시간', 'the fields work immediately during the entrance')
    assert.equal(hours().getAttribute('type'), 'number')
    assert.equal(minutes().getAttribute('type'), 'number')
    assert.equal(hours().value, '1')
    assert.equal(minutes().value, '0')
    assert.equal(hours().getAttribute('min'), '0')
    assert.equal(hours().getAttribute('max'), '999')
    assert.equal(minutes().getAttribute('max'), '59')

    await fixture.set('시간', '2')
    await fixture.set('분', '15')
    now += 90_000
    assert.equal(state.motionCalls.length, 1, 'typing does not restart the entrance')
    await fixture.click('확인')
    assert.deepEqual(Array.from(state.calls), [new Date(now + 135 * 60_000).toISOString()], 'the delay starts when confirmed')
    assert.equal(state.closed, 1)

    state.reducedMotion = true
    await fixture.mount({ disabled: false })
    assert.equal(entrance.canceled, true, 'unmounting cancels the previous entrance')
    assert.equal(state.motionCalls[0].options.duration, 100)
    assert.ok(state.motionCalls[0].frames.every(frame => frame.transform === undefined && frame.clipPath === undefined), 'reduced motion uses only a short fade')
    const reducedEntrance = state.motionCalls[0]
    state.reducedMotion = false
    await fixture.mount({ disabled: false })
    assert.equal(reducedEntrance.canceled, true)
    assert.equal(state.motionCalls.length, 1, 'reopening starts one fresh entrance')
    assert.equal(state.motionCalls[0].options.duration, 240)

    for (const [hour, minute] of [['0', '1'], ['999', '59']]) {
      await fixture.mount({ disabled: false })
      await fixture.set('시간', hour)
      await fixture.set('분', minute)
      await fixture.click('확인')
      assert.equal(state.calls[0], new Date(now + (Number(hour) * 60 + Number(minute)) * 60_000).toISOString(), 'valid duration boundaries remain schedulable')
      assert.equal(state.closed, 1)
    }

    for (const [hour, minute] of [['0', '0'], ['', '1'], ['-1', '0'], ['1.5', '0'], ['1000', '0'], ['0', '60'], ['0', '-1'], ['0', '0.5']]) {
      await fixture.mount({ disabled: false })
      await fixture.set('시간', hour)
      await fixture.set('분', minute)
      await fixture.submit()
      assert.equal(state.calls.length, 0, `${hour} hours and ${minute} minutes cannot be scheduled`)
      assert.equal(state.closed, 0)
    }

    await fixture.mount({ disabled: true })
    assert.equal(confirm().disabled, true)
    await fixture.submit()
    assert.equal(state.calls.length, 0, 'disabled scheduling cannot bypass its guard through form submission')

    await fixture.mount({ disabled: false, initialAt: new Date(now + 60 * 60_000 + 1).toISOString() })
    assert.equal(hours().value, '1')
    assert.equal(minutes().value, '1', 'remaining partial minutes round up for existing schedules')
    await fixture.key('분', 'Escape')
    assert.equal(state.closed, 1)
    assert.equal(state.calls.length, 0, 'Escape cancels without scheduling')
    assert.equal(state.outerKeys.length, 0, 'Escape stays inside the schedule control')

    await fixture.mount({ disabled: false, initialAt: new Date(now + 60 * 60_000).toISOString() })
    assert.equal(hours().value, '1')
    assert.equal(minutes().value, '0', 'an exact minute does not gain an extra minute')

    await fixture.mount({ disabled: false })
    await fixture.click('예약 전송 닫기')
    assert.equal(state.closed, 1)
    assert.equal(state.calls.length, 0)

    fixture.mode('pending')
    await fixture.mount({ disabled: false })
    await fixture.set('시간', '0')
    await fixture.set('분', '5')
    await fixture.click('확인')
    assert.equal(state.calls.length, 1)
    for (const control of win.document.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')) assert.equal(control.disabled, true, 'all controls lock during submission')
    await fixture.submit()
    await fixture.key('분', 'Escape')
    assert.equal(state.calls.length, 1, 'pending submissions cannot be duplicated')
    assert.equal(state.closed, 0, 'pending saves cannot be dismissed')
    await fixture.finish('Schedule failed')
    assert.ok(win.document.body.textContent.includes('Schedule failed'))
    assert.equal(state.closed, 0)
    assert.equal(hours().value, '0')
    assert.equal(minutes().value, '5')
    assert.equal(confirm().disabled, false)
    fixture.mode('success')
    now += 60_000
    await fixture.click('확인')
    assert.equal(state.calls.length, 2)
    assert.equal(state.calls[1], new Date(now + 5 * 60_000).toISOString())
    assert.equal(state.closed, 1, 'a successful retry closes the control')

    win.eval('Element.prototype.animate = undefined')
    await fixture.mount({ disabled: false })
    assert.equal(state.motionCalls.length, 0)
    assert.equal(win.document.activeElement?.getAttribute('aria-label'), '시간')
    await fixture.click('확인')
    assert.equal(state.calls.length, 1, 'scheduling still works without the animation API')
  } finally {
    await fixture.destroy()
    await win.happyDOM.close()
  }
})
