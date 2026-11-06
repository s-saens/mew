import test from 'node:test'
import assert from 'node:assert/strict'
import { adjacentDockPanel, DOCK_POSITIONS, MOBILE_DOCK_ORDER, moveDockPanel, normalizeDockPositions, normalizeMobileDockOrder, normalizeHiddenDockPanels, visibleDockPanels } from './mobile-dock.ts'

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

test('dock order preserves customization and inserts new entries before desktop', () => {
  assert.deepEqual(normalizeMobileDockOrder(null), MOBILE_DOCK_ORDER)
  assert.deepEqual(normalizeMobileDockOrder(MOBILE_DOCK_ORDER.filter(id => id !== 'tasks')), MOBILE_DOCK_ORDER)
  assert.deepEqual(normalizeMobileDockOrder(['sidebar', 'editor', 'agent', 'terminal', 'git', 'browser', 'desktop']), MOBILE_DOCK_ORDER)
  assert.deepEqual(normalizeMobileDockOrder(['git', 'git', 'unknown', 'editor']), ['git', 'editor', 'sidebar', 'agent', 'terminal', 'debugger', 'browser', 'desktop', 'memo', 'tasks', 'chat'])
  assert.deepEqual(normalizeMobileDockOrder(['browser', 'sidebar', 'editor', 'agent', 'terminal', 'git']), ['browser', 'sidebar', 'editor', 'agent', 'terminal', 'git', 'debugger', 'desktop', 'memo', 'tasks', 'chat'])
  assert.deepEqual(moveDockPanel([...MOBILE_DOCK_ORDER], 'desktop', 'sidebar'), ['desktop', 'sidebar', 'editor', 'agent', 'terminal', 'git', 'debugger', 'browser', 'memo', 'tasks', 'chat'])
})
test('swipes use adjacent allowed panels, preserve custom order and stop at either end', () => {
  assert.equal(adjacentDockPanel(MOBILE_DOCK_ORDER, 'editor', -1), 'sidebar')
  assert.equal(adjacentDockPanel(MOBILE_DOCK_ORDER, 'editor', 1), 'agent')
  assert.equal(adjacentDockPanel(MOBILE_DOCK_ORDER, 'browser', 1), 'desktop')
  assert.equal(adjacentDockPanel(MOBILE_DOCK_ORDER, 'git', 1), 'debugger')
  assert.equal(adjacentDockPanel(MOBILE_DOCK_ORDER, 'sidebar', -1), undefined)
  assert.equal(adjacentDockPanel(MOBILE_DOCK_ORDER, 'desktop', 1), 'memo')
  assert.equal(adjacentDockPanel(['editor', 'desktop', 'sidebar'], 'editor', 1), 'desktop')
  assert.equal(adjacentDockPanel(['sidebar', 'editor'], 'editor', 1), undefined)
  assert.equal(adjacentDockPanel(MOBILE_DOCK_ORDER, 'memo', 1), 'tasks')
  assert.equal(adjacentDockPanel(MOBILE_DOCK_ORDER, 'chat', 1), undefined)
  assert.equal(adjacentDockPanel([], 'editor', 1), undefined)
})

test('task entries persist and retired RAG entries disappear without changing the customized dock order', () => {
  const saved = ['browser', 'memo', 'tasks', 'rag', 'git', 'editor', 'sidebar', 'agent', 'terminal', 'debugger', 'desktop', 'rag']
  assert.deepEqual(normalizeMobileDockOrder(saved), ['browser', 'memo', 'tasks', 'git', 'editor', 'sidebar', 'agent', 'terminal', 'debugger', 'desktop', 'chat'])
})

test('visibility filters preferences and permissions without losing stored order', () => {
  assert.deepEqual(normalizeHiddenDockPanels(null), [])
  assert.deepEqual(normalizeHiddenDockPanels(['agent', 'agent', 'rag', 3, null]), ['agent'])
  const order = normalizeMobileDockOrder(['git', 'agent', 'editor'])
  assert.deepEqual(visibleDockPanels(order, ['editor', 'agent', 'git'], ['agent']), ['git', 'editor'])
  assert.deepEqual(visibleDockPanels(order, ['editor', 'agent', 'git'], ['git', 'editor', 'agent']), [])
  assert.deepEqual(visibleDockPanels(order, ['editor', 'agent', 'git'], []), ['git', 'agent', 'editor'])
})

test('retired database action is removed from saved order and visibility preferences', () => {
  const saved = ['database', 'chat', 'editor', 'database', 'sidebar']
  const order = normalizeMobileDockOrder(saved)
  assert.deepEqual(order.filter(id => ['chat', 'editor', 'sidebar'].includes(id)), ['chat', 'editor', 'sidebar'])
  assert.equal((order as readonly string[]).includes('database'), false)
  assert.deepEqual(normalizeHiddenDockPanels(['database', 'agent', 'database']), ['agent'])
  assert.deepEqual(visibleDockPanels(order, ['editor', 'chat'], []), ['chat', 'editor'])
  assert.equal(adjacentDockPanel(order, 'chat', 1), 'editor')
})

test('chat joins saved Dock preferences and follows panel navigation and permission visibility', () => {
  const previous = MOBILE_DOCK_ORDER.filter(id => id !== 'chat')
  assert.deepEqual(normalizeMobileDockOrder(previous), MOBILE_DOCK_ORDER)
  assert.deepEqual(normalizeMobileDockOrder(['chat', ...previous]), ['chat', ...previous])
  assert.deepEqual(normalizeHiddenDockPanels(['chat', 'chat']), ['chat'])
  assert.deepEqual(visibleDockPanels(MOBILE_DOCK_ORDER, ['editor', 'chat'], []), ['editor', 'chat'])
  assert.deepEqual(visibleDockPanels(MOBILE_DOCK_ORDER, ['editor'], []), ['editor'])
  assert.deepEqual(visibleDockPanels(MOBILE_DOCK_ORDER, ['editor', 'chat'], ['chat']), ['editor'])
  assert.equal(adjacentDockPanel(['editor', 'chat'], 'editor', 1), 'chat')
  assert.equal(adjacentDockPanel(['editor', 'chat'], 'chat', -1), 'editor')
})
