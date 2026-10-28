export function captureCommandMenuShortcut(open: () => void): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.shiftKey || event.isComposing) return
    const matches = (event.altKey && !event.ctrlKey && (event.code === 'KeyR' || event.key.toLowerCase() === 'r'))
      || (event.ctrlKey && !event.altKey && (event.code === 'KeyE' || event.key.toLowerCase() === 'e'))
    if (!matches) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (!event.repeat) open()
  }
  window.addEventListener('keydown', onKeyDown, true)
  return () => window.removeEventListener('keydown', onKeyDown, true)
}

export function focusFirstCommand(menu: HTMLElement | null) {
  const first = menu?.querySelector<HTMLButtonElement>('[data-command-choice]:not(:disabled)')
    ?? menu?.querySelector<HTMLButtonElement>('button:not(:disabled)')
  first?.focus()
}

export function navigateCommandMenu(event: KeyboardEvent, menu: HTMLElement) {
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code)?.[1] ?? (/^[1-9]$/.test(event.key) ? event.key : null)
  if (digit !== null) {
    const command = menu.querySelectorAll<HTMLButtonElement>('[data-command-choice]')[Number(digit) - 1]
    if (!command) return
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat && !command.disabled) {
      command.focus()
      command.click()
    }
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  const rows = Array.from(menu.querySelectorAll<HTMLElement>('[data-command-row]'))
    .map(row => Array.from(row.querySelectorAll<HTMLButtonElement>('button:not(:disabled):not([data-command-drag-handle])')))
    .filter(row => row.length > 0)
  if (!rows.length) return
  event.preventDefault()
  event.stopPropagation()
  const active = menu.ownerDocument.activeElement
  const rowIndex = rows.findIndex(row => row.includes(active as HTMLButtonElement))
  const column = rowIndex < 0 ? 0 : rows[rowIndex].indexOf(active as HTMLButtonElement)
  let target: HTMLButtonElement
  if (event.key === 'Home') target = rows[0][0]
  else if (event.key === 'End') target = rows.at(-1)![0]
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    const row = rows[Math.max(0, rowIndex)]
    target = row[(column + (event.key === 'ArrowRight' ? 1 : -1) + row.length) % row.length]
  } else {
    const step = event.key === 'ArrowDown' ? 1 : -1
    const origin = rowIndex < 0 ? (step > 0 ? -1 : 0) : rowIndex
    const row = rows[(origin + step + rows.length) % rows.length]
    target = row[Math.min(column, row.length - 1)]
  }
  target.focus()
}
