import test from 'node:test'
import assert from 'node:assert/strict'
import { adjacentDockPanel, DOCK_POSITIONS, MOBILE_DOCK_ORDER, normalizeDockPositions, normalizeMobileDockOrder, normalizeHiddenDockPanels, visibleDockPanels } from './mobile-dock.ts'

test('dock positions default independently and accept each supported edge', () => {
  const defaults = { desktop: 'left', mobile: 'bottom' }
  for (const invalid of [undefined, null, false, 42, 'top', [], ['right']]) {
    assert.deepEqual(normalizeDockPositions(invalid), defaults)
  }
  for (const position of DOCK_POSITIONS) {
    assert.deepEqual(normalizeDockPositions({ desktop: position }), { desktop: position, mobile: 'bottom' })
    assert.deepEqual(normalizeDockPositions({ mobile: position }), { desktop: 'left', mobile: position })
  }
  assert.deepEqual(normalizeDockPositions({ desktop: 'right', mobile: 'top' }), { desktop: 'right', mobile: 'top' })
  assert.deepEqual(normalizeDockPositions({ desktop: 'floating', mobile: 'right', unrelated: 'top' }), { desktop: 'left', mobile: 'right' })
  assert.deepEqual(normalizeDockPositions({ desktop: 'bottom', mobile: 0 }), { desktop: 'bottom', mobile: 'bottom' })
})

test('dock order preserves customization and removes the retired desktop entry', () => {
  assert.deepEqual(normalizeMobileDockOrder(null), MOBILE_DOCK_ORDER)
  assert.deepEqual(normalizeMobileDockOrder(MOBILE_DOCK_ORDER), MOBILE_DOCK_ORDER)
  assert.deepEqual(normalizeMobileDockOrder(['sidebar', 'editor', 'agent', 'terminal', 'git', 'browser', 'desktop']), MOBILE_DOCK_ORDER)
  assert.deepEqual(normalizeMobileDockOrder(['git', 'git', 'unknown', 'editor']), ['git', 'editor', 'sidebar', 'agent', 'terminal', 'debugger', 'browser', 'memo'])
  assert.deepEqual(normalizeMobileDockOrder(['browser', 'sidebar', 'editor', 'agent', 'terminal', 'git']), ['debugger', 'browser', 'sidebar', 'editor', 'agent', 'terminal', 'git', 'memo'])
})
test('swipes use adjacent allowed panels, preserve custom order and stop at either end', () => {
  assert.equal(adjacentDockPanel(MOBILE_DOCK_ORDER, 'editor', -1), 'sidebar')
  assert.equal(adjacentDockPanel(MOBILE_DOCK_ORDER, 'editor', 1), 'agent')
  assert.equal(adjacentDockPanel(MOBILE_DOCK_ORDER, 'browser', 1), 'memo')
  assert.equal(adjacentDockPanel(MOBILE_DOCK_ORDER, 'git', 1), 'debugger')
  assert.equal(adjacentDockPanel(MOBILE_DOCK_ORDER, 'sidebar', -1), undefined)
  assert.equal(adjacentDockPanel(['sidebar', 'editor'], 'editor', 1), undefined)
  assert.equal(adjacentDockPanel(MOBILE_DOCK_ORDER, 'memo', 1), undefined)
  assert.equal(adjacentDockPanel([], 'editor', 1), undefined)
})

test('task and RAG entries disappear without changing the customized dock order', () => {
  const saved = ['browser', 'memo', 'tasks', 'rag', 'git', 'editor', 'sidebar', 'agent', 'terminal', 'debugger', 'desktop', 'rag']
  assert.deepEqual(normalizeMobileDockOrder(saved), ['browser', 'memo', 'git', 'editor', 'sidebar', 'agent', 'terminal', 'debugger'])
})

test('visibility filters preferences and permissions without losing stored order', () => {
  assert.deepEqual(normalizeHiddenDockPanels(null), [])
  assert.deepEqual(normalizeHiddenDockPanels(['agent', 'agent', 'rag', 3, null]), ['agent'])
  const order = normalizeMobileDockOrder(['git', 'agent', 'editor'])
  assert.deepEqual(visibleDockPanels(order, ['editor', 'agent', 'git'], ['agent']), ['git', 'editor'])
  assert.deepEqual(visibleDockPanels(order, ['editor', 'agent', 'git'], ['git', 'editor', 'agent']), [])
  assert.deepEqual(visibleDockPanels(order, ['editor', 'agent', 'git'], []), ['git', 'agent', 'editor'])
})

test('retired database and chat entries are ignored in saved Dock preferences', () => {
  const order = normalizeMobileDockOrder(['database', 'chat', 'editor', 'database', 'sidebar'])
  assert.deepEqual(order, ['editor', 'sidebar', 'agent', 'terminal', 'git', 'debugger', 'browser', 'memo'])
  assert.deepEqual(normalizeHiddenDockPanels(['database', 'chat', 'agent', 'database']), ['agent'])
  assert.equal(adjacentDockPanel(order, 'chat', 1), undefined)
})
