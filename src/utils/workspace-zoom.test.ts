import test from 'node:test'
import assert from 'node:assert/strict'
import { loadWorkspaceZoom, stepWorkspaceZoom, WORKSPACE_ZOOM_KEY } from './workspace-zoom.ts'

test('workspace zoom restores valid levels and bounds step changes', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  let value: string | null = '125'
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => key === WORKSPACE_ZOOM_KEY ? value : null } })
  t.after(() => { if (original) Object.defineProperty(globalThis, 'localStorage', original); else Reflect.deleteProperty(globalThis, 'localStorage') })
  assert.equal(loadWorkspaceZoom(), 125)
  value = 'invalid'
  assert.equal(loadWorkspaceZoom(), 100)
  assert.equal(stepWorkspaceZoom(50, -1), 50)
  assert.equal(stepWorkspaceZoom(200, 1), 200)
  assert.equal(stepWorkspaceZoom(100, 1), 110)
})
