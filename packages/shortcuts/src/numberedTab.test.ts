import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { adjacentPanelTabDirection } from './numberedTab.ts'

const event = (extra: Partial<Parameters<typeof adjacentPanelTabDirection>[0]> = {}) => ({
  altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, isComposing: false, code: 'KeyE', key: 'e', ...extra,
})

test('next-tab Alt+Shift+E leaves plain Alt+E available to the server file explorer', () => {
  assert.equal(adjacentPanelTabDirection(event()), null)
  assert.equal(adjacentPanelTabDirection(event({ shiftKey: true })), 1)
  assert.equal(adjacentPanelTabDirection(event({ shiftKey: true, key: '´' })), 1)
  assert.equal(adjacentPanelTabDirection(event({ shiftKey: true, code: '', key: 'E' })), 1)
  assert.equal(adjacentPanelTabDirection(event({ code: 'KeyQ', key: 'q' })), -1)
  assert.equal(adjacentPanelTabDirection(event({ code: 'KeyQ', key: 'q', shiftKey: true })), null)
  for (const extra of [{ altKey: false }, { ctrlKey: true }, { metaKey: true }, { isComposing: true }, { code: 'KeyS' }]) {
    assert.equal(adjacentPanelTabDirection(event({ shiftKey: true, ...extra })), null)
  }
})

test('standard Ctrl/Cmd tab-navigation aliases keep their existing direction', () => {
  for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
    for (const [code, shiftKey, direction] of [['Tab', false, 1], ['Tab', true, -1], ['PageUp', false, -1], ['PageDown', false, 1]] as const) {
      assert.equal(adjacentPanelTabDirection(event({ ...modifier, altKey: false, code, key: code, shiftKey })), direction)
    }
  }
})

test('shortcut settings list the fixed workspace tool keys without the old next-tab conflict', () => {
  const definitions = JSON.parse(readFileSync(new URL('./shortcuts.json', import.meta.url), 'utf8')) as Array<{ id: string; keys: string; editable: boolean }>
  for (const [id, keys] of [['openServerFileExplorer', 'Alt+E'], ['openScheduledTasks', 'Alt+S'], ['nextPanelTab', 'Alt+Shift+E']]) {
    const definition = definitions.find(item => item.id === id)
    assert.equal(definition?.keys, keys)
    assert.equal(definition?.editable, false)
    assert.equal(definitions.filter(item => item.keys === keys).length, 1)
  }
})
