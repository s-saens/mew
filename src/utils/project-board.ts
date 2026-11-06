export const PROJECT_BOARD_VERSION = 1
export const PROJECT_PANEL_WIDTH = 400
export const PROJECT_PANEL_MIN_WIDTH = 280
export const PROJECT_PANEL_MIN_HEIGHT = 240
export const PROJECT_BOARD_GAP = 4

export type ProjectBoardPanel = { id: string; projectPath: string; workingRoot: string }
export type ProjectBoardRow = { panelId: string; weight: number }
export type ProjectBoardColumn = { id: string; width: number; rows: ProjectBoardRow[] }
export type ProjectBoardState = {
  version: 1
  panels: ProjectBoardPanel[]
  columns: ProjectBoardColumn[]
  activePanelId: string | null
}
export type ProjectBoardDestination = { type: 'column'; index: number } | { type: 'row'; columnId: string; index: number }
export type ProjectBoardAction =
  | { type: 'focus'; panelId: string }
  | { type: 'add'; panel: ProjectBoardPanel; availableWidth?: number }
  | { type: 'replace'; panelId: string; projectPath: string; workingRoot: string }
  | { type: 'remove'; panelId: string }
  | { type: 'move'; panelId: string; destination: ProjectBoardDestination }
  | { type: 'move-direction'; panelId: string; direction: 'left' | 'right' | 'up' | 'down' }
  | { type: 'column-width'; columnId: string; width: number }
  | { type: 'row-resize'; columnId: string; rowIndex: number; delta: number; height: number }

const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const positive = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
const width = (value: unknown) => Math.max(PROJECT_PANEL_MIN_WIDTH, Math.min(4000, positive(value, PROJECT_PANEL_WIDTH)))
const indexAt = (index: number, length: number) => Math.max(0, Math.min(length, Number.isFinite(index) ? Math.trunc(index) : length))

export function createProjectBoard(panel?: ProjectBoardPanel): ProjectBoardState {
  return { version: PROJECT_BOARD_VERSION, panels: panel ? [{ ...panel }] : [], columns: panel ? [{ id: `column:${panel.id}`, width: PROJECT_PANEL_WIDTH, rows: [{ panelId: panel.id, weight: 1 }] }] : [], activePanelId: panel?.id ?? null }
}

/** Storage contains geometry and project identities; session data stays with the caller. */
export function normalizeProjectBoard(value: unknown, fallback?: ProjectBoardPanel): ProjectBoardState {
  if (!record(value) || value.version !== PROJECT_BOARD_VERSION || !Array.isArray(value.panels) || !Array.isArray(value.columns)) return createProjectBoard(fallback)
  const ids = new Set<string>(), projects = new Set<string>(), placed = new Set<string>(), columnIds = new Set<string>()
  const panels: ProjectBoardPanel[] = []
  for (const panel of value.panels) {
    if (!record(panel) || !text(panel.id) || !text(panel.projectPath) || ids.has(panel.id) || projects.has(panel.projectPath)) continue
    ids.add(panel.id); projects.add(panel.projectPath)
    panels.push({ id: panel.id, projectPath: panel.projectPath, workingRoot: text(panel.workingRoot) ? panel.workingRoot : panel.projectPath })
  }
  const columns: ProjectBoardColumn[] = []
  for (const column of value.columns) {
    if (!record(column) || !text(column.id) || columnIds.has(column.id) || !Array.isArray(column.rows)) continue
    const rows: ProjectBoardRow[] = []
    for (const row of column.rows) {
      if (!record(row) || !text(row.panelId) || !ids.has(row.panelId) || placed.has(row.panelId)) continue
      placed.add(row.panelId); rows.push({ panelId: row.panelId, weight: Math.min(1000, positive(row.weight, 1)) })
    }
    if (rows.length) { columnIds.add(column.id); columns.push({ id: column.id, width: width(column.width), rows }) }
  }
  for (const panel of panels) if (!placed.has(panel.id)) {
    let id = `column:${panel.id}`
    while (columnIds.has(id)) id += ':'
    columnIds.add(id); columns.push({ id, width: PROJECT_PANEL_WIDTH, rows: [{ panelId: panel.id, weight: 1 }] })
  }
  return { version: PROJECT_BOARD_VERSION, panels, columns, activePanelId: text(value.activePanelId) && ids.has(value.activePanelId) ? value.activePanelId : panels[0]?.id ?? null }
}

export function projectPanelLocation(state: ProjectBoardState, panelId: string) {
  for (let columnIndex = 0; columnIndex < state.columns.length; columnIndex++) {
    const rowIndex = state.columns[columnIndex].rows.findIndex(row => row.panelId === panelId)
    if (rowIndex !== -1) return { columnIndex, rowIndex, column: state.columns[columnIndex] }
  }
  return null
}

function movePanel(state: ProjectBoardState, panelId: string, destination: ProjectBoardDestination): ProjectBoardState {
  const source = projectPanelLocation(state, panelId)
  if (!source || destination.type === 'row' && !state.columns.some(column => column.id === destination.columnId)) return state
  const columns = state.columns.map(column => ({ ...column, rows: column.rows.filter(row => row.panelId !== panelId) }))
  if (destination.type === 'row') {
    const target = columns.find(column => column.id === destination.columnId)!
    const offset = target.id === source.column.id && destination.index > source.rowIndex ? 1 : 0
    const weight = target.rows.length ? target.rows.reduce((sum, row) => sum + row.weight, 0) / target.rows.length : 1
    target.rows.splice(indexAt(destination.index - offset, target.rows.length), 0, { panelId, weight })
  } else {
    let id = `column:${panelId}`
    while (columns.some(column => column.id === id)) id += ':'
    columns.splice(indexAt(destination.index, columns.length), 0, { id, width: source.column.width, rows: [{ panelId, weight: 1 }] })
  }
  return { ...state, columns: columns.filter(column => column.rows.length), activePanelId: panelId }
}

export function projectBoardReducer(state: ProjectBoardState, action: ProjectBoardAction): ProjectBoardState {
  if (action.type === 'focus') return state.activePanelId === action.panelId || !state.panels.some(panel => panel.id === action.panelId) ? state : { ...state, activePanelId: action.panelId }
  if (action.type === 'add') {
    const existing = state.panels.find(panel => panel.projectPath === action.panel.projectPath)
    if (existing) return projectBoardReducer(state, { type: 'focus', panelId: existing.id })
    if (!text(action.panel.id) || !text(action.panel.projectPath) || !text(action.panel.workingRoot) || state.panels.some(panel => panel.id === action.panel.id)) return state
    const panels = [...state.panels, { ...action.panel }], columns = [...state.columns]
    const occupied = columns.reduce((sum, column) => sum + column.width + PROJECT_BOARD_GAP, 0)
    if (columns.length && action.availableWidth !== undefined && action.availableWidth - occupied < PROJECT_PANEL_WIDTH) {
      const location = projectPanelLocation(state, state.activePanelId ?? '')
      const columnIndex = location?.columnIndex ?? columns.length - 1, column = columns[columnIndex]
      const weight = column.rows.reduce((sum, row) => sum + row.weight, 0) / column.rows.length
      columns[columnIndex] = { ...column, rows: [...column.rows, { panelId: action.panel.id, weight }] }
    } else {
      let id = `column:${action.panel.id}`
      while (columns.some(column => column.id === id)) id += ':'
      columns.push({ id, width: PROJECT_PANEL_WIDTH, rows: [{ panelId: action.panel.id, weight: 1 }] })
    }
    return { ...state, panels, columns, activePanelId: action.panel.id }
  }
  if (action.type === 'replace') {
    if (!text(action.projectPath) || !text(action.workingRoot) || !state.panels.some(panel => panel.id === action.panelId)) return state
    const existing = state.panels.find(panel => panel.projectPath === action.projectPath && panel.id !== action.panelId)
    if (existing) return projectBoardReducer(state, { type: 'focus', panelId: existing.id })
    return { ...state, panels: state.panels.map(panel => panel.id === action.panelId ? { ...panel, projectPath: action.projectPath, workingRoot: action.workingRoot } : panel), activePanelId: action.panelId }
  }
  if (action.type === 'remove') {
    const panelIndex = state.panels.findIndex(panel => panel.id === action.panelId)
    if (panelIndex === -1) return state
    const panels = state.panels.filter(panel => panel.id !== action.panelId)
    const columns = state.columns.map(column => ({ ...column, rows: column.rows.filter(row => row.panelId !== action.panelId) })).filter(column => column.rows.length)
    return { ...state, panels, columns, activePanelId: state.activePanelId === action.panelId ? panels[Math.min(panelIndex, panels.length - 1)]?.id ?? null : state.activePanelId }
  }
  if (action.type === 'move') return movePanel(state, action.panelId, action.destination)
  if (action.type === 'move-direction') {
    const source = projectPanelLocation(state, action.panelId)
    if (!source) return state
    if (action.direction === 'up' || action.direction === 'down') {
      const next = source.rowIndex + (action.direction === 'up' ? -1 : 1)
      if (next < 0 || next >= source.column.rows.length) return state
      return movePanel(state, action.panelId, { type: 'row', columnId: source.column.id, index: next + (next > source.rowIndex ? 1 : 0) })
    }
    const next = source.columnIndex + (action.direction === 'left' ? -1 : 1)
    const target = state.columns[next]
    if (!target && source.column.rows.length === 1) return state
    return movePanel(state, action.panelId, target ? { type: 'row', columnId: target.id, index: Math.min(source.rowIndex, target.rows.length) } : { type: 'column', index: action.direction === 'left' ? 0 : state.columns.length })
  }
  if (action.type === 'column-width') {
    if (!Number.isFinite(action.width)) return state
    return { ...state, columns: state.columns.map(column => column.id === action.columnId ? { ...column, width: width(action.width) } : column) }
  }
  const column = state.columns.find(column => column.id === action.columnId)
  if (!column || action.rowIndex < 0 || action.rowIndex >= column.rows.length - 1 || !Number.isFinite(action.delta) || !Number.isFinite(action.height) || action.height <= 0) return state
  const sum = column.rows.reduce((total, row) => total + row.weight, 0)
  const free = action.height - PROJECT_BOARD_GAP * (column.rows.length - 1) - PROJECT_PANEL_MIN_HEIGHT * column.rows.length
  if (free <= 0) return state
  const first = column.rows[action.rowIndex], second = column.rows[action.rowIndex + 1], combined = first.weight + second.weight
  const minimum = Math.min(combined / 2, .001)
  const firstWeight = Math.max(minimum, Math.min(combined - minimum, first.weight + action.delta / free * sum))
  return { ...state, columns: state.columns.map(item => item !== column ? item : { ...item, rows: item.rows.map((row, index) => index === action.rowIndex ? { ...row, weight: firstWeight } : index === action.rowIndex + 1 ? { ...row, weight: combined - firstWeight } : row) }) }
}

export type ProjectBoardRect = { x: number; y: number; width: number; height: number }
export function projectBoardGeometry(state: ProjectBoardState, viewport: { width: number; height: number }) {
  const count = Math.max(1, ...state.columns.map(column => column.rows.length))
  const height = Math.max(viewport.height, count * PROJECT_PANEL_MIN_HEIGHT + (count - 1) * PROJECT_BOARD_GAP)
  const rects: Record<string, ProjectBoardRect> = Object.create(null)
  let x = 0
  for (const column of state.columns) {
    const columnWidth = state.columns.length === 1 && viewport.width > 0 ? Math.min(column.width, viewport.width) : column.width
    const sum = column.rows.reduce((total, row) => total + row.weight, 0)
    const free = Math.max(0, height - column.rows.length * PROJECT_PANEL_MIN_HEIGHT - (column.rows.length - 1) * PROJECT_BOARD_GAP)
    let y = 0
    for (const row of column.rows) {
      const rowHeight = PROJECT_PANEL_MIN_HEIGHT + free * row.weight / sum
      rects[row.panelId] = { x, y, width: columnWidth, height: rowHeight }
      y += rowHeight + PROJECT_BOARD_GAP
    }
    x += columnWidth + PROJECT_BOARD_GAP
  }
  return { rects, width: Math.max(viewport.width, x ? x - PROJECT_BOARD_GAP : 0), height }
}
