import assert from 'node:assert/strict'
import test from 'node:test'
import { createProjectBoard, normalizeProjectBoard, projectBoardGeometry, projectBoardReducer, projectPanelLocation, PROJECT_PANEL_MIN_HEIGHT, PROJECT_PANEL_MIN_WIDTH, type ProjectBoardPanel } from './project-board.ts'

const panel = (id: string, projectPath = `/projects/${id}`, workingRoot = projectPath): ProjectBoardPanel => ({ id, projectPath, workingRoot })
const initial = () => createProjectBoard(panel('a'))
const three = () => ['b', 'c'].reduce((state, id) => projectBoardReducer(state, { type: 'add', panel: panel(id), availableWidth: 1800 }), initial())

test('first entry is one 400px full-height project with unused shared background', () => {
  const state = initial(), geometry = projectBoardGeometry(state, { width: 1920, height: 1000 })
  assert.deepEqual(geometry.rects.a, { x: 0, y: 0, width: 400, height: 1000 })
  assert.equal(geometry.width, 1920)
  assert.deepEqual(projectBoardGeometry(state, { width: 320, height: 700 }).rects.a, { x: 0, y: 0, width: 320, height: 700 })
})

test('an intentionally empty board stays empty while unsupported or corrupt storage uses the initial panel', () => {
  assert.deepEqual(normalizeProjectBoard(createProjectBoard(), panel('a')), createProjectBoard())
  for (const value of [null, false, { version: 2 }, { version: 1, panels: [] }]) assert.deepEqual(normalizeProjectBoard(value, panel('a')), initial())
  assert.deepEqual(projectBoardReducer(initial(), { type: 'remove', panelId: 'a' }), createProjectBoard())
})

test('normalization deduplicates project and panel identities, repairs placement and active focus, and bounds geometry', () => {
  const next = normalizeProjectBoard({ version: 1, activePanelId: 'missing', panels: [null, panel('a'), panel('b', '/projects/a'), panel('a', '/other'), panel('c'), panel('d')], columns: [
    { id: 'first', width: -10, rows: [null, { panelId: 'a', weight: -5 }, { panelId: 'c', weight: Infinity }, { panelId: 'missing', weight: 1 }] },
    { id: 'second', width: 999999, rows: [{ panelId: 'a', weight: 1 }] },
    { id: 'first', width: 300, rows: [{ panelId: 'd', weight: 1 }] },
  ] })
  assert.deepEqual(next.panels.map(item => item.id), ['a', 'c', 'd'])
  assert.equal(next.activePanelId, 'a')
  assert.deepEqual(next.columns[0], { id: 'first', width: 400, rows: [{ panelId: 'a', weight: 1 }, { panelId: 'c', weight: 1 }] })
  assert.equal(next.columns[1].rows[0].panelId, 'd')
  assert.deepEqual(normalizeProjectBoard(next), next)
})

test('adding uses horizontal room then appends a row to the active column without changing other project state', () => {
  let state = projectBoardReducer(initial(), { type: 'add', panel: panel('b'), availableWidth: 1000 })
  assert.equal(state.columns.length, 2)
  const before = state.panels[0]
  state = projectBoardReducer(state, { type: 'focus', panelId: 'a' })
  state = projectBoardReducer(state, { type: 'add', panel: panel('c'), availableWidth: 1000 })
  assert.equal(state.columns.length, 2)
  assert.deepEqual(state.columns[0].rows.map(row => row.panelId), ['a', 'c'])
  assert.equal(state.panels[0], before)
  assert.equal(state.activePanelId, 'c')
})

test('selecting an already open logical project focuses it even when another worktree was requested', () => {
  const state = three()
  const added = projectBoardReducer(state, { type: 'add', panel: panel('other-a', '/projects/a', '/worktrees/a') })
  assert.equal(added.activePanelId, 'a')
  assert.equal(added.panels.length, 3)
  assert.equal(added.panels[0].workingRoot, '/projects/a')
  const replaced = projectBoardReducer(state, { type: 'replace', panelId: 'c', projectPath: '/projects/a', workingRoot: '/worktrees/a' })
  assert.equal(replaced.activePanelId, 'a')
  assert.equal(replaced.panels[2], state.panels[2])
})

test('replacement and worktree changes retain the stable view identity and geometry', () => {
  const state = three()
  const replaced = projectBoardReducer(state, { type: 'replace', panelId: 'b', projectPath: '/other', workingRoot: '/worktree' })
  assert.deepEqual(replaced.panels[1], { id: 'b', projectPath: '/other', workingRoot: '/worktree' })
  assert.equal(replaced.columns, state.columns)
  assert.equal(replaced.panels[0], state.panels[0])
})

test('moving between columns and rows never changes session identities or leaves empty columns', () => {
  let state = three(), panels = state.panels
  state = projectBoardReducer(state, { type: 'move', panelId: 'b', destination: { type: 'row', columnId: 'column:a', index: 1 } })
  assert.deepEqual(state.columns.map(column => column.rows.map(row => row.panelId)), [['a', 'b'], ['c']])
  state = projectBoardReducer(state, { type: 'move', panelId: 'b', destination: { type: 'row', columnId: 'column:a', index: 0 } })
  assert.deepEqual(state.columns[0].rows.map(row => row.panelId), ['b', 'a'])
  state = projectBoardReducer(state, { type: 'move', panelId: 'b', destination: { type: 'column', index: 2 } })
  assert.deepEqual(state.columns.map(column => column.rows.map(row => row.panelId)), [['a'], ['c'], ['b']])
  assert.equal(state.panels, panels)
  assert.equal(new Set(state.columns.flatMap(column => column.rows.map(row => row.panelId))).size, panels.length)
})

test('keyboard movements reorder rows, enter adjacent columns, and create an edge column when needed', () => {
  let state = projectBoardReducer(initial(), { type: 'add', panel: panel('b'), availableWidth: 500 })
  state = projectBoardReducer(state, { type: 'move-direction', panelId: 'b', direction: 'up' })
  assert.deepEqual(state.columns[0].rows.map(row => row.panelId), ['b', 'a'])
  state = projectBoardReducer(state, { type: 'move-direction', panelId: 'b', direction: 'right' })
  assert.deepEqual(state.columns.map(column => column.rows.map(row => row.panelId)), [['a'], ['b']])
  state = projectBoardReducer(state, { type: 'move-direction', panelId: 'b', direction: 'left' })
  assert.deepEqual(state.columns.map(column => column.rows.map(row => row.panelId)), [['b', 'a']])
  assert.deepEqual(projectPanelLocation(state, 'a')?.rowIndex, 1)
  assert.equal(projectPanelLocation(state, 'missing'), null)
})

test('resizing changes only the requested boundary and preserves usable minimum sizes', () => {
  let state = projectBoardReducer(initial(), { type: 'add', panel: panel('b'), availableWidth: 500 })
  const before = projectBoardGeometry(state, { width: 1200, height: 900 })
  state = projectBoardReducer(state, { type: 'row-resize', columnId: 'column:a', rowIndex: 0, delta: 50, height: 900 })
  const after = projectBoardGeometry(state, { width: 1200, height: 900 })
  assert.ok(Math.abs(after.rects.a.height - before.rects.a.height - 50) < .0001)
  assert.ok(Math.abs(after.rects.b.height - before.rects.b.height + 50) < .0001)
  state = projectBoardReducer(state, { type: 'row-resize', columnId: 'column:a', rowIndex: 0, delta: 999999, height: 900 })
  assert.ok(projectBoardGeometry(state, { width: 1200, height: 900 }).rects.b.height >= PROJECT_PANEL_MIN_HEIGHT)
  state = projectBoardReducer(state, { type: 'column-width', columnId: 'column:a', width: 1 })
  assert.equal(state.columns[0].width, PROJECT_PANEL_MIN_WIDTH)
  const small = projectBoardGeometry(state, { width: 200, height: 100 })
  assert.equal(small.height, PROJECT_PANEL_MIN_HEIGHT * 2 + 4)
  assert.equal(small.rects.a.height, PROJECT_PANEL_MIN_HEIGHT)
  assert.equal(small.rects.b.height, PROJECT_PANEL_MIN_HEIGHT)
})

test('closing a focused panel selects a remaining view and never changes its project or worktree', () => {
  const state = three()
  const next = projectBoardReducer(state, { type: 'remove', panelId: 'c' })
  assert.equal(next.activePanelId, 'b')
  assert.deepEqual(next.panels, state.panels.slice(0, 2))
  assert.equal(next.columns.length, 2)
})
