import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Plus } from 'iconoir-react'
import { reorderLayoutRect, useReorderAnimation } from '@mew/ui'
import { PanelCloseButton } from './panel-close-button'
import { PROJECT_BOARD_GAP, PROJECT_PANEL_MIN_WIDTH, projectBoardGeometry, projectBoardReducer, type ProjectBoardDestination, type ProjectBoardPanel, type ProjectBoardState } from '../utils/project-board'
import './project-board.css'

export type ProjectBoardLabels = {
  board: string
  add: string
  select: string
  close: string
  move: string
  resizeColumn: string
  resizeRow: string
}
export type ProjectBoardProps = {
  value: ProjectBoardState
  onChange: (value: ProjectBoardState) => void
  renderPanel: (panel: ProjectBoardPanel) => ReactNode
  getPanelLabel: (panel: ProjectBoardPanel) => string
  onSelectProject: (panelId: string) => void
  onAdd: () => void
  labels: ProjectBoardLabels
  presentation?: 'board' | 'single'
  retainedPanels?: readonly ProjectBoardPanel[]
  singlePanelId?: string | null
  renderProjectIcon?: (panel: ProjectBoardPanel) => ReactNode
  renderHeaderActions?: (panel: ProjectBoardPanel) => ReactNode
  onClosePanel?: (panelId: string) => void
  onPanelElement?: (panelId: string, element: HTMLElement | null) => void
  isDraft?: (panel: ProjectBoardPanel) => boolean
  children?: ReactNode
}
type GestureDetail = { kind: 'move'; panelId: string; moved: boolean } | { kind: 'column'; columnId: string; width: number } | { kind: 'row'; columnId: string; rowIndex: number; height: number }
type Gesture = {
  pointerId: number
  element: HTMLElement
  startX: number
  startY: number
  clientX: number
  clientY: number
  scrollX: number
  scrollY: number
  offsetX: number
  offsetY: number
  panel: HTMLElement | null
  state: ProjectBoardState
} & GestureDetail

const rectStyle = (rect: { x: number; y: number; width: number; height: number }): CSSProperties => ({ left: rect.x, top: rect.y, width: rect.width, height: rect.height })

function ProjectPanelHost({ panelId, onPanelElement, ...props }: ComponentProps<'section'> & { panelId: string; onPanelElement: (id: string, element: HTMLElement | null) => void }) {
  const register = useCallback((element: HTMLElement | null) => onPanelElement(panelId, element), [panelId, onPanelElement])
  return <section {...props} ref={register} />
}

/** Flat keyed hosts keep project tools mounted when their column, row, or mode changes. */
export function ProjectBoard(props: ProjectBoardProps) {
  const { value, renderPanel, getPanelLabel, labels, presentation = 'board', renderHeaderActions, renderProjectIcon, retainedPanels = [], singlePanelId, children } = props
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [drop, setDrop] = useState<{ destination: ProjectBoardDestination; style: CSSProperties } | null>(null)
  const [moving, setMoving] = useState<string | null>(null)
  const latest = useRef(props), gesture = useRef<Gesture | null>(null)
  useLayoutEffect(() => { latest.current = props })
  const registerPanel = useCallback((id: string, element: HTMLElement | null) => latest.current.onPanelElement?.(id, element), [])
  const geometry = projectBoardGeometry(value, viewport)
  const captureReorder = useReorderAnimation(() => host?.querySelectorAll<HTMLElement>('[data-project-panel]:not([hidden])') ?? [])

  const updateDraggedPanel = (current: Gesture, board: HTMLDivElement) => {
    if (current.kind !== 'move' || !current.panel) return
    const x = current.clientX - current.startX + board.scrollLeft - current.scrollX + current.offsetX
    const y = current.clientY - current.startY + board.scrollTop - current.scrollY + current.offsetY
    current.panel.style.translate = `${x}px ${y}px`
  }

  useLayoutEffect(() => {
    if (!host) return
    const measure = () => setViewport({ width: host.clientWidth, height: host.clientHeight })
    const observer = new ResizeObserver(measure)
    observer.observe(host); measure()
    return () => observer.disconnect()
  }, [host])

  const change = (action: Parameters<typeof projectBoardReducer>[1], animate = false) => {
    const current = latest.current
    const next = projectBoardReducer(current.value, action)
    if (next !== current.value) {
      if (animate) captureReorder()
      current.onChange(next)
    }
  }

  const cancelGesture = (action?: Parameters<typeof projectBoardReducer>[1]) => {
    const current = gesture.current
    if (!current) return
    gesture.current = null
    if (current.kind === 'move' && (current.moved || current.offsetX || current.offsetY)) {
      captureReorder()
      if (current.panel) current.panel.style.translate = ''
    }
    if (action) change(action)
    if (current?.element.hasPointerCapture(current.pointerId)) current.element.releasePointerCapture(current.pointerId)
    setDrop(null); setMoving(null)
  }
  useEffect(() => {
    const cancel = () => cancelGesture()
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && gesture.current) { event.preventDefault(); event.stopPropagation(); cancel() } }
    window.addEventListener('keydown', key, true)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('blur', cancel)
      const current = gesture.current
      if (current?.panel) current.panel.style.translate = ''
      if (current?.element.hasPointerCapture(current.pointerId)) current.element.releasePointerCapture(current.pointerId)
    }
  }, [])
  useEffect(() => {
    if (gesture.current) cancelGesture()
  }, [presentation])
  useEffect(() => {
    const ids = new Set(value.panels.map(panel => panel.id))
    const current = gesture.current
    if (current?.kind === 'move' && !ids.has(current.panelId)) cancelGesture()
  }, [value.panels])

  const destinationAt = (x: number, y: number) => {
    if (!host) return null
    const bounds = host.getBoundingClientRect()
    if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return null
    const localX = x - bounds.left + host.scrollLeft, localY = y - bounds.top + host.scrollTop
    for (const column of value.columns) {
      for (let index = 0; index < column.rows.length; index++) {
        const rect = geometry.rects[column.rows[index].panelId]
        if (localX < rect.x || localX > rect.x + rect.width || localY < rect.y || localY > rect.y + rect.height) continue
        if (localX < rect.x + Math.min(60, rect.width * .2) || localX > rect.x + rect.width - Math.min(60, rect.width * .2)) {
          const after = localX > rect.x + rect.width / 2
          return { destination: { type: 'column' as const, index: value.columns.indexOf(column) + Number(after) }, style: { left: after ? rect.x + rect.width - 3 : rect.x, top: 0, width: 4, height: geometry.height } }
        }
        const after = localY >= rect.y + rect.height / 2
        return { destination: { type: 'row' as const, columnId: column.id, index: index + Number(after) }, style: { left: rect.x, top: after ? rect.y + rect.height - 3 : rect.y, width: rect.width, height: 4 } }
      }
    }
    const last = value.columns.at(-1), lastRect = last && geometry.rects[last.rows[0].panelId]
    if (!lastRect || localX > lastRect.x + lastRect.width) return { destination: { type: 'column' as const, index: value.columns.length }, style: { left: lastRect ? lastRect.x + lastRect.width + PROJECT_BOARD_GAP : 0, top: 0, width: 4, height: geometry.height } }
    return null
  }
  const updateDrop = (x: number, y: number) => {
    const target = destinationAt(x, y)
    setDrop(previous => previous?.style.left === target?.style.left && previous?.style.top === target?.style.top && previous?.style.width === target?.style.width && previous?.style.height === target?.style.height ? previous : target)
  }
  const updateDropRef = useRef(updateDrop)
  useLayoutEffect(() => { updateDropRef.current = updateDrop })
  useEffect(() => {
    if (!host) return
    const scroll = () => {
      const current = gesture.current
      if (current?.kind !== 'move' || !current.moved) return
      updateDraggedPanel(current, host)
      updateDropRef.current(current.clientX, current.clientY)
    }
    host.addEventListener('scroll', scroll)
    return () => host.removeEventListener('scroll', scroll)
  }, [host])

  const begin = (event: ReactPointerEvent<HTMLElement>, detail: GestureDetail) => {
    if (event.button !== 0 || !event.isPrimary) return
    event.preventDefault(); event.stopPropagation()
    cancelGesture()
    event.currentTarget.setPointerCapture(event.pointerId)
    const panel = detail.kind === 'move' ? event.currentTarget.closest<HTMLElement>('[data-project-panel]') : null
    let offsetX = 0, offsetY = 0
    if (panel) {
      const visual = panel.getBoundingClientRect(), layout = reorderLayoutRect(panel)
      offsetX = visual.x - layout.x; offsetY = visual.y - layout.y
      for (const animation of panel.getAnimations()) animation.cancel()
      if (offsetX || offsetY) { panel.style.translate = `${offsetX}px ${offsetY}px`; setMoving(detail.kind === 'move' ? detail.panelId : null) }
    }
    gesture.current = { ...detail, pointerId: event.pointerId, element: event.currentTarget, startX: event.clientX, startY: event.clientY, clientX: event.clientX, clientY: event.clientY, scrollX: host?.scrollLeft ?? 0, scrollY: host?.scrollTop ?? 0, offsetX, offsetY, panel, state: latest.current.value } as Gesture
  }
  const pointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    event.preventDefault(); event.stopPropagation()
    const dx = event.clientX - current.startX, dy = event.clientY - current.startY
    if (current.kind === 'move') {
      if (!current.moved && Math.hypot(dx, dy) < 5) return
      if (!current.moved) { current.moved = true; setMoving(current.panelId) }
      current.clientX = event.clientX; current.clientY = event.clientY
      if (host) {
        const bounds = host.getBoundingClientRect()
        host.scrollBy({ left: event.clientX > bounds.right - 36 ? 16 : event.clientX < bounds.left + 36 ? -16 : 0, top: event.clientY > bounds.bottom - 36 ? 16 : event.clientY < bounds.top + 36 ? -16 : 0 })
        updateDraggedPanel(current, host)
      }
      updateDrop(event.clientX, event.clientY)
    } else {
      const next = projectBoardReducer(current.state, current.kind === 'column' ? { type: 'column-width', columnId: current.columnId, width: current.width + dx } : { type: 'row-resize', columnId: current.columnId, rowIndex: current.rowIndex, delta: dy, height: current.height })
      latest.current.onChange(next)
    }
  }
  const pointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    event.preventDefault(); event.stopPropagation()
    if (current.kind === 'move' && current.moved) {
      current.clientX = event.clientX; current.clientY = event.clientY
      if (host) updateDraggedPanel(current, host)
      const target = destinationAt(event.clientX, event.clientY)
      cancelGesture(target ? { type: 'move', panelId: current.panelId, destination: target.destination } : undefined)
      return
    }
    cancelGesture()
  }
  const pointerProps = { onPointerMove: pointerMove, onPointerUp: pointerUp, onPointerCancel: () => cancelGesture(), onLostPointerCapture: () => cancelGesture() }
  const active = presentation === 'single' && singlePanelId ? singlePanelId : value.activePanelId ?? value.panels[0]?.id
  const boardIds = new Set(value.panels.map(panel => panel.id))
  const panelIds = new Set(boardIds)
  const panels = [...value.panels]
  for (const panel of retainedPanels) if (!panelIds.has(panel.id)) { panelIds.add(panel.id); panels.push(panel) }

  return <div ref={setHost} className="mew-project-board" data-project-board data-presentation={presentation} role="region" aria-label={labels.board}>
    <div className="mew-project-board-surface" style={presentation === 'board' ? { width: geometry.width, height: geometry.height } : { width: '100%', height: '100%' }}>
      {panels.map(panel => {
        const label = getPanelLabel(panel), visible = presentation === 'board' ? boardIds.has(panel.id) : panel.id === active
        const rect = geometry.rects[panel.id]
        return <ProjectPanelHost key={panel.id} panelId={panel.id} onPanelElement={registerPanel} data-project-panel={panel.id} data-project-draft={props.isDraft?.(panel) || undefined} data-project-path={panel.projectPath} data-active={panel.id === active || undefined} data-moving={moving === panel.id || undefined}
          className="mew-project-board-panel" aria-label={label} hidden={!visible}
          style={presentation === 'single' ? { inset: 0 } : rect ? rectStyle(rect) : { display: 'none' }}
          onPointerDownCapture={() => change({ type: 'focus', panelId: panel.id })} onFocusCapture={() => change({ type: 'focus', panelId: panel.id })}>
          <div className="mew-project-board-header" hidden={presentation === 'single'}>
            <button type="button" className="mew-project-board-grip" data-project-panel-handle={panel.id} aria-label={`${labels.move}: ${label}`} data-tip={labels.move}
              {...pointerProps} onPointerDown={event => begin(event, { kind: 'move', panelId: panel.id, moved: false })}
              onKeyDown={event => {
                if (event.nativeEvent.isComposing || !event.key.startsWith('Arrow')) return
                const direction = ({ ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' } as const)[event.key]
                if (!direction) return
                event.preventDefault(); event.stopPropagation(); change({ type: 'move-direction', panelId: panel.id, direction }, true)
              }}>
              <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true">{[4, 8, 12].map(y => <g key={y}><circle cx="4" cy={y} r="1" /><circle cx="8" cy={y} r="1" /></g>)}</svg>
            </button>
            <button type="button" className="mew-project-board-name" aria-label={`${labels.select}: ${label}`} data-tip={label} onClick={() => latest.current.onSelectProject(panel.id)}>
              {renderProjectIcon?.(panel)}<span>{label}</span>
            </button>
            {renderHeaderActions?.(panel)}
            <PanelCloseButton aria-label={`${labels.close}: ${label}`} onClick={() => latest.current.onClosePanel ? latest.current.onClosePanel(panel.id) : change({ type: 'remove', panelId: panel.id })} />
          </div>
          <div className="mew-project-board-body">{renderPanel(panel)}</div>
        </ProjectPanelHost>
      })}
      {presentation === 'board' && value.columns.flatMap(column => {
        const firstRect = geometry.rects[column.rows[0].panelId]
        return [<div key={`width:${column.id}`} role="separator" tabIndex={0} aria-orientation="vertical" aria-label={labels.resizeColumn} aria-valuemin={PROJECT_PANEL_MIN_WIDTH} aria-valuemax={4000} aria-valuenow={Math.round(column.width)}
          className="mew-project-board-resize-column" style={{ left: firstRect.x + firstRect.width - 2, top: 0, height: geometry.height }} data-project-column-resize={column.id}
          {...pointerProps} onPointerDown={event => begin(event, { kind: 'column', columnId: column.id, width: column.width })}
          onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); event.stopPropagation(); change({ type: 'column-width', columnId: column.id, width: event.key === 'Home' ? PROJECT_PANEL_MIN_WIDTH : event.key === 'End' ? 4000 : column.width + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 80 : 16) }) }} />,
          ...column.rows.slice(0, -1).map((row, rowIndex) => {
            const rect = geometry.rects[row.panelId]
            return <div key={`height:${row.panelId}`} role="separator" tabIndex={0} aria-orientation="horizontal" aria-label={labels.resizeRow} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((rect.y + rect.height) / geometry.height * 100)}
              className="mew-project-board-resize-row" style={{ left: rect.x, top: rect.y + rect.height - 2, width: rect.width }} data-project-row-resize={row.panelId}
              {...pointerProps} onPointerDown={event => begin(event, { kind: 'row', columnId: column.id, rowIndex, height: geometry.height })}
              onKeyDown={event => { if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return; event.preventDefault(); event.stopPropagation(); change({ type: 'row-resize', columnId: column.id, rowIndex, delta: (event.key === 'ArrowUp' ? -1 : 1) * (event.shiftKey ? 80 : 16), height: geometry.height }) }} />
          })]
      })}
      {presentation === 'board' && <button type="button" className="mew-project-board-add" aria-label={labels.add} data-tip={labels.add} onClick={() => latest.current.onAdd()}
        style={{ left: value.columns.length ? geometry.rects[value.columns.at(-1)!.rows[0].panelId].x + geometry.rects[value.columns.at(-1)!.rows[0].panelId].width + 8 : 8 }}><Plus width={18} height={18} aria-hidden="true" /></button>}
      {drop && <div className="mew-project-board-drop" style={drop.style} />}
      {children}
    </div>
  </div>
}
