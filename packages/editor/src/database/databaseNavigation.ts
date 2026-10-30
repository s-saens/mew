import type { KeyboardEvent } from 'react'

const directions: Record<string, [number, number]> = {
  ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
}

export function navigateDatabaseTable(event: KeyboardEvent<HTMLDivElement>, preferredColumn: { current: number }): boolean {
  if (event.defaultPrevented || event.nativeEvent.isComposing || event.keyCode === 229 ||
    event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false
  const surface = event.currentTarget, target = event.target as HTMLElement
  const cell = target.closest<HTMLElement>('[data-db-cell]')
  const table = surface.querySelector<HTMLTableElement>('[data-db-grid] table')
  if (!cell || !table || !surface.contains(target) || cell.closest('[data-db-surface]') !== surface) return false
  const consume = () => { event.preventDefault(); event.stopPropagation(); return true }

  if (event.key === 'Escape' && target !== cell) {
    if (cell.querySelector('[aria-expanded="true"]')) return false
    cell.focus({ preventScroll: true })
    return consume()
  }
  if (event.key === 'Enter' && target.tagName === 'INPUT' && !cell.querySelector('[aria-expanded="true"]')) {
    cell.focus({ preventScroll: true })
    return consume()
  }
  if ((event.key === 'Enter' || event.key === 'F2') && target === cell) {
    const control = cell.querySelector<HTMLInputElement>('input:not(:disabled)') ??
      cell.querySelector<HTMLButtonElement>('[data-db-cell-editor]:not(:disabled)') ??
      cell.querySelector<HTMLButtonElement>('button:not(:disabled)')
    control?.focus({ preventScroll: true })
    if (control?.tagName === 'BUTTON' || control?.type === 'checkbox') control.click()
    return consume()
  }
  const direction = directions[event.key]
  if (!direction) return false
  if (target !== cell) {
    if (target.closest('[aria-haspopup]') || cell.querySelector('[aria-expanded="true"]') || target.isContentEditable || target.tagName === 'TEXTAREA') return false
    if (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'checkbox') {
      const input = target as HTMLInputElement
      if (direction[1] && (input.selectionStart === null || input.selectionStart !== input.selectionEnd ||
        (direction[1] < 0 ? input.selectionStart !== 0 : input.selectionEnd !== input.value.length))) return false
    }
  }

  const title = surface.querySelector<HTMLElement>('[data-db-title-cell]')
  const rowIndex = cell === title ? -1 : cell.closest('tr')!.rowIndex
  const columnCount = table.tHead?.rows[0]?.querySelectorAll('[data-db-cell]').length ?? 0
  const columnIndex = cell === title ? Math.min(preferredColumn.current, columnCount - 1) : (cell as HTMLTableCellElement).cellIndex
  const nextRow = rowIndex + direction[0]
  const nextColumn = columnIndex + direction[1]
  if (nextRow < -1 || nextRow >= table.rows.length || nextColumn < 0 || nextColumn >= columnCount || (cell === title && direction[1])) return consume()
  const destination = nextRow === -1 ? title : table.rows[nextRow]?.cells[nextColumn]
  if (!destination?.hasAttribute('data-db-cell')) return consume()
  preferredColumn.current = nextColumn
  destination.focus({ preventScroll: true })
  destination.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  return consume()
}
