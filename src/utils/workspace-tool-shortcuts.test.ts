import assert from 'node:assert/strict'
import test from 'node:test'
import { Window } from 'happy-dom'
import { captureWorkspaceToolShortcuts } from './workspace-tool-shortcuts.ts'

test('workspace tools capture Alt+E/S before inputs while preserving permissions and remote priority', async () => {
  const window = new Window()
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { value: window, configurable: true })
  const { registerKeyboardCapture } = await import('../../packages/shortcuts/src/keyboardCapture.ts')
  const input = window.document.createElement('textarea')
  window.document.body.append(input)
  const opened: string[] = []
  let received = 0
  input.addEventListener('keydown', event => { received++; event.stopPropagation() })
  const press = (code: 'KeyE' | 'KeyS', extra: KeyboardEventInit = {}) => {
    const event = new window.KeyboardEvent('keydown', { key: code === 'KeyE' ? 'e' : 's', code, altKey: true, bubbles: true, cancelable: true, ...extra })
    input.dispatchEvent(event)
    return event.defaultPrevented
  }
  let stop = captureWorkspaceToolShortcuts({ openExplorer: () => opened.push('explorer'), openSchedules: () => opened.push('schedules') })
  try {
    assert.equal(press('KeyE'), true)
    assert.equal(press('KeyS'), true)
    assert.deepEqual(opened, ['explorer', 'schedules'])
    assert.equal(received, 0, 'editor and terminal listeners cannot consume tool keys first')
    for (const code of ['KeyE', 'KeyS'] as const) {
      assert.equal(press(code, { key: code === 'KeyE' ? 'ㄷ' : 'ß' }), true, 'physical codes work with other keyboard layouts')
      assert.equal(press(code, { key: code === 'KeyE' ? 'E' : 'S', code: '' }), true, 'events without a physical code fall back to their letter')
      const count = opened.length
      assert.equal(press(code, { repeat: true }), true)
      assert.equal(opened.length, count, 'holding a tool key does not reopen it')
      for (const extra of [{ altKey: false }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { isComposing: true }, { code: 'KeyX' }]) {
        assert.equal(press(code, extra), false)
        assert.equal(opened.length, count)
      }
    }
    const count = opened.length
    const releaseRemote = registerKeyboardCapture(event => {
      event.preventDefault()
      event.stopImmediatePropagation()
      return true
    })
    try {
      assert.equal(press('KeyE'), true)
      assert.equal(press('KeyS'), true)
      assert.equal(opened.length, count, 'a remote surface registered later retains exclusive capture priority')
    } finally { releaseRemote() }

    stop()
    const prevent = (event: Event) => event.preventDefault()
    window.addEventListener('keydown', prevent, true)
    stop = captureWorkspaceToolShortcuts({ openExplorer: () => opened.push('explorer') })
    assert.equal(press('KeyE'), true)
    assert.equal(opened.length, count, 'already prevented keys do not invoke tools')
    window.removeEventListener('keydown', prevent, true)
    assert.equal(press('KeyE'), true)
    assert.equal(opened.length, count + 1)
    assert.equal(press('KeyS'), false, 'a missing permission callback leaves its key available')

    stop()
    stop = captureWorkspaceToolShortcuts({ openSchedules: () => opened.push('schedules') })
    assert.equal(press('KeyE'), false)
    assert.equal(press('KeyS'), true)
    assert.equal(opened.length, count + 2)
    stop()
    stop = captureWorkspaceToolShortcuts({})
    assert.equal(press('KeyE'), false)
    assert.equal(press('KeyS'), false)
    stop()
    assert.equal(press('KeyE'), false, 'cleanup releases the window listener')
    assert.equal(opened.length, count + 2)
  } finally {
    stop()
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
    await window.happyDOM.close()
  }
})
