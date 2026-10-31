import type { ILink, ILinkProvider, Terminal } from '@xterm/xterm'
import { localBrowserUrl, requestLocalBrowser } from '@mew/ui/local-browser'

export function activateTerminalHyperlink(_event: MouseEvent, url: string): void {
  if (requestLocalBrowser(url)) return
  // Preserve xterm's confirmation and opener isolation for ordinary OSC 8 links.
  if (!window.confirm(`Do you want to navigate to ${url}?\n\nWARNING: This link could potentially be dangerous`)) return
  const opened = window.open()
  if (opened) {
    try { opened.opener = null } catch { /* Electron may forbid changing opener. */ }
    opened.location.href = url
  }
}

export function createLocalBrowserLinkProvider(term: Pick<Terminal, 'buffer' | 'cols'>): ILinkProvider {
  return {
    provideLinks(lineNumber, callback) {
      const buffer = term.buffer.active
      let first = lineNumber - 1
      if (!buffer.getLine(first)) { callback(undefined); return }
      while (first > 0 && buffer.getLine(first)?.isWrapped) first--
      let text = ''
      const positions: { x: number; y: number; endX: number }[] = []
      for (let row = first; row < buffer.length; row++) {
        const line = buffer.getLine(row)
        if (!line || (row > first && !line.isWrapped)) break
        for (let column = 0; column < Math.min(term.cols, line.length); column++) {
          const cell = line.getCell(column)
          if (!cell || cell.getWidth() === 0) continue
          const chars = cell.getChars() || ' '
          text += chars
          for (let index = 0; index < chars.length; index++) {
            positions.push({ x: column + 1, y: row + 1, endX: column + cell.getWidth() })
          }
        }
      }
      const links: ILink[] = []
      const candidates = /https?:\/\/[^\s<>"'`]+|(?:localhost|127(?:\.\d{1,3}){3}|\[::1\]):\d+[^\s<>"'`]*/gi
      for (const match of text.matchAll(candidates)) {
        if (match.index > 0 && /[\w./:-]/.test(text[match.index - 1])) continue
        let raw = match[0].replace(/[.,;!]+$/, '')
        for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
          while (raw.endsWith(close) && raw.split(close).length > raw.split(open).length) raw = raw.slice(0, -1)
        }
        if (!localBrowserUrl(raw)) continue
        const start = positions[match.index]
        const end = positions[match.index + raw.length - 1]
        if (!start || !end || start.y > lineNumber || end.y < lineNumber) continue
        links.push({
          text: raw,
          range: { start: { x: start.x, y: start.y }, end: { x: end.endX, y: end.y } },
          activate: event => {
            if (event.button > 1) return
            event.preventDefault()
            requestLocalBrowser(raw)
          },
        })
      }
      callback(links.length ? links : undefined)
    },
  }
}
