import test from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import { handleDockShortcut } from './dock-shortcuts.ts'
import { visibleDockPanels } from './mobile-dock.ts'
import { APP_KEYBOARD_KEYS } from './keyboard-lock.ts'

test('function keys select the visible dock order and consume unused keys and repeats', () => {
  const win = new Window()
  Object.defineProperty(globalThis, 'Element', { value: win.Element, configurable: true })
  const input = win.document.createElement('input')
  win.document.body.append(input)
  const selected: string[] = []
  const panels = visibleDockPanels(['git', 'agent', 'editor', 'sidebar'], ['git', 'agent', 'editor'], ['agent'])
  win.addEventListener('keydown', event => handleDockShortcut(event as unknown as KeyboardEvent, panels, panel => selected.push(panel)), true)
  const press = (key: string, init = {}, target = input) => {
    const event = new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    target.dispatchEvent(event)
    return event.defaultPrevented
  }
  assert.equal(press('F1'), true)
  assert.equal(press('F2'), true)
  assert.equal(press('F12'), true)
  assert.equal(press('F1', { repeat: true }), true)
  assert.equal(press('F1', { ctrlKey: true }), false)
  assert.equal(press('F13'), false)
  assert.deepEqual(selected, ['git', 'editor'])
  for (let index = 1; index <= 12; index++) assert.ok(APP_KEYBOARD_KEYS.includes(`F${index}`))
  const dialog = win.document.createElement('div')
  dialog.setAttribute('role', 'dialog')
  const dialogInput = win.document.createElement('input')
  dialog.append(dialogInput); win.document.body.append(dialog)
  assert.equal(press('F1', {}, dialogInput), false)
  const remote = win.document.createElement('div')
  remote.setAttribute('data-browser-desktop', '')
  const remoteInput = win.document.createElement('input')
  remote.append(remoteInput); win.document.body.append(remote)
  assert.equal(press('F1', {}, remoteInput), false)
  assert.deepEqual(selected, ['git', 'editor'])
})
