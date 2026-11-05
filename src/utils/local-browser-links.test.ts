import assert from 'node:assert/strict'
import test from 'node:test'
import { Window } from 'happy-dom'
import { requestLocalBrowser } from '@mew/ui/local-browser'
import { captureLocalBrowserLinks } from './local-browser-links.ts'

test('captures localhost anchors before editor handlers and opens shared requests once', async () => {
  const browser = new Window({ url: 'https://mew.example/' })
  Object.defineProperties(globalThis, {
    window: { value: browser, configurable: true },
    document: { value: browser.document, configurable: true },
    CustomEvent: { value: browser.CustomEvent, configurable: true },
  })
  const opened: string[] = []
  const cleanup = captureLocalBrowserLinks(url => opened.push(url))
  const anchor = browser.document.createElement('a')
  anchor.href = 'http://localhost:5173/nested?q=1#part'
  anchor.innerHTML = '<span>Local app</span>'
  browser.document.body.append(anchor)
  let editorClicks = 0
  anchor.addEventListener('click', () => editorClicks++)
  const click = (type = 'click', button = 0) => {
    const event = new browser.MouseEvent(type, { bubbles: true, cancelable: true, button })
    anchor.firstElementChild!.dispatchEvent(event)
    return event.defaultPrevented
  }
  try {
    assert.equal(click(), true)
    assert.equal(editorClicks, 0)
    assert.deepEqual(opened, ['http://localhost:5173/nested?q=1#part'])
    assert.equal(click('auxclick', 1), true)
    assert.equal(click('auxclick', 2), false)
    assert.equal(opened.length, 2)
    const modifiedClick = new browser.MouseEvent('click', { button: 0, ctrlKey: true, bubbles: true, cancelable: true })
    anchor.dispatchEvent(modifiedClick)
    assert.equal(modifiedClick.defaultPrevented, true)
    assert.equal(opened.length, 3, 'modifier clicks also use the host-app navigation handler')
    assert.equal(requestLocalBrowser('127.0.0.1:9000/route'), true)
    assert.equal(opened.at(-1), 'http://127.0.0.1:9000/route')
    assert.equal(requestLocalBrowser('https://example.com'), false)
    assert.equal(opened.length, 4)

    const selection = browser.document.getSelection()!
    selection.selectAllChildren(anchor)
    assert.equal(click(), false, 'text selection must remain available for copying')
    selection.removeAllRanges()
    anchor.href = 'https://example.com/'
    assert.equal(click(), false)
    assert.equal(opened.length, 4)
    cleanup()
    anchor.href = 'http://localhost:5173'
    assert.equal(click(), false)
    requestLocalBrowser('localhost:8000')
    assert.equal(opened.length, 4)
  } finally {
    cleanup()
    await browser.happyDOM.close()
  }
})
