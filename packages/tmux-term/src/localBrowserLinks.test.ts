import assert from 'node:assert/strict'
import test from 'node:test'
import { Window } from 'happy-dom'
import type { ILink, Terminal } from '@xterm/xterm'
import { LOCAL_BROWSER_OPEN_EVENT } from '@mew/ui/local-browser'
import { activateTerminalHyperlink, createLocalBrowserLinkProvider } from './localBrowserLinks.ts'

function terminal(lines: { text: string; wrapped?: boolean }[], cols = 80) {
  return {
    cols,
    buffer: { active: {
      length: lines.length,
      getLine(row: number) {
        const data = lines[row]
        if (!data) return undefined
        const cells: { chars: string; width: number }[] = []
        for (const char of data.text) {
          const width = char === '한' ? 2 : 1
          cells.push({ chars: char, width })
          if (width === 2) cells.push({ chars: '', width: 0 })
        }
        return {
          length: cells.length, isWrapped: Boolean(data.wrapped),
          getCell(column: number) {
            const cell = cells[column]
            return cell && { getChars: () => cell.chars, getWidth: () => cell.width }
          },
        }
      },
    } },
  } as unknown as Pick<Terminal, 'buffer' | 'cols'>
}

function links(term: Pick<Terminal, 'buffer' | 'cols'>, row = 1) {
  let result: ILink[] | undefined
  createLocalBrowserLinkProvider(term).provideLinks(row, value => { result = value })
  return result ?? []
}

test('detects local terminal URLs with accurate cell ranges and excludes external links', () => {
  const line = '한 http://localhost:3000/path?q=1#part'
  const found = links(terminal([{ text: line }]))
  assert.equal(found.length, 1)
  assert.equal(found[0].text, 'http://localhost:3000/path?q=1#part')
  assert.deepEqual(found[0].range, { start: { x: 4, y: 1 }, end: { x: line.length + 1, y: 1 } })
  assert.equal(links(terminal([{ text: 'https://example.com http://localhost.evil:3000 http://localhost:99999' }])).length, 0)
  assert.equal(links(terminal([{ text: '(localhost:3000/path).' }]))[0].text, 'localhost:3000/path')
  assert.equal(links(terminal([{ text: 'http://[::1]:8080/path' }]))[0].text, 'http://[::1]:8080/path')
})

test('detects localhost links across wrapped terminal rows and opens them through the DOM browser event', async () => {
  const browser = new Window()
  Object.defineProperties(globalThis, {
    window: { value: browser, configurable: true },
    CustomEvent: { value: browser.CustomEvent, configurable: true },
  })
  const opened: string[] = []
  browser.addEventListener(LOCAL_BROWSER_OPEN_EVENT, event => opened.push((event as unknown as CustomEvent<{ url: string }>).detail.url))
  const term = terminal([{ text: 'http://localhost:30' }, { text: '00/path?x=1#part', wrapped: true }], 19)
  try {
    const found = links(term, 2)
    assert.equal(found.length, 1)
    assert.equal(found[0].text, 'http://localhost:3000/path?x=1#part')
    assert.deepEqual(found[0].range, { start: { x: 1, y: 1 }, end: { x: 16, y: 2 } })
    const event = new browser.MouseEvent('click', { cancelable: true })
    found[0].activate(event as unknown as MouseEvent, found[0].text)
    assert.equal(event.defaultPrevented, true)
    activateTerminalHyperlink(event as unknown as MouseEvent, 'http://127.0.0.1:8080/login')
    assert.deepEqual(opened, ['http://localhost:3000/path?x=1#part', 'http://127.0.0.1:8080/login'])
    const confirmations: string[] = []
    browser.confirm = message => { confirmations.push(message ?? ''); return false }
    activateTerminalHyperlink(event as unknown as MouseEvent, 'https://example.com/')
    assert.equal(confirmations.length, 1, 'external OSC 8 links retain xterm confirmation')
    assert.equal(opened.length, 2)
  } finally { await browser.happyDOM.close() }
})
