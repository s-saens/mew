import assert from 'node:assert/strict'
import test from 'node:test'
import { Window } from 'happy-dom'
import { bindDomBrowserScroll, type DomBrowserScroll } from './dom-browser-scroll.ts'

function fixture() {
  const browser = new Window()
  const element = browser.document.createElement('div')
  browser.document.body.append(element)
  const doc = browser.document as unknown as Document
  const target = element as unknown as Element
  const packets: DomBrowserScroll[] = []
  const bind = () => bindDomBrowserScroll(doc, node => node === target ? 1 : node === doc ? 2 : -1, data => packets.push(data))
  const scroll = (y: number) => {
    element.scrollTop = y
    element.dispatchEvent(new browser.Event('scroll'))
  }
  return { browser, element, target, packets, bind, scroll }
}

test('native scrolling relays the latest position every 60 ms while events continue', async t => {
  const { browser, packets, bind, scroll } = fixture()
  const scrolling = bind()
  t.mock.timers.enable({ apis: ['setTimeout'] })
  try {
    scroll(110)
    t.mock.timers.tick(20); scroll(220)
    t.mock.timers.tick(20); scroll(330)
    t.mock.timers.tick(19); scroll(440)
    assert.deepEqual(packets, [])
    t.mock.timers.tick(1)
    assert.deepEqual(packets, [{ id: 1, x: 0, y: 440, scrollRevision: 4 }])
    t.mock.timers.tick(1); scroll(500)
    t.mock.timers.tick(30); scroll(600)
    t.mock.timers.tick(29)
    assert.equal(packets.length, 1)
    t.mock.timers.tick(1)
    assert.deepEqual(packets[1], { id: 1, x: 0, y: 600, scrollRevision: 6 })
  } finally {
    scrolling.dispose(); t.mock.timers.reset(); await browser.happyDOM.close()
  }
})

test('disposing cancels pending scroll input and a fresh binding starts new revisions', async t => {
  const { browser, packets, bind, scroll } = fixture()
  const scrolling = bind()
  let fresh: ReturnType<typeof bind> | undefined
  t.mock.timers.enable({ apis: ['setTimeout'] })
  try {
    scroll(100)
    t.mock.timers.tick(30)
    scrolling.dispose()
    t.mock.timers.tick(1000)
    scroll(200)
    t.mock.timers.tick(1000)
    assert.deepEqual(packets, [])
    fresh = bind()
    scroll(300)
    t.mock.timers.tick(60)
    assert.deepEqual(packets, [{ id: 1, x: 0, y: 300, scrollRevision: 1 }])
  } finally {
    scrolling.dispose(); fresh?.dispose(); t.mock.timers.reset(); await browser.happyDOM.close()
  }
})

test('host scrolling suppresses input at the actual clamped position', async t => {
  const { browser, element, target, packets, bind, scroll } = fixture()
  const scrolling = bind()
  const applied: ScrollToOptions[] = []
  target.scrollTo = (options?: ScrollToOptions | number) => {
    assert.equal(typeof options, 'object')
    const position = options as ScrollToOptions
    applied.push(position)
    element.scrollLeft = 0
    element.scrollTop = Math.min(300, Math.max(0, position.top ?? 0))
  }
  t.mock.timers.enable({ apis: ['setTimeout'] })
  try {
    scrolling.applyHostScroll({ id: 1, x: 0, y: 900 }, target)
    assert.deepEqual(applied, [{ left: 0, top: 900, behavior: 'instant' }])
    assert.equal(element.scrollTop, 300)
    element.dispatchEvent(new browser.Event('scroll'))
    t.mock.timers.tick(60)
    assert.deepEqual(packets, [])
    scroll(280)
    t.mock.timers.tick(60)
    assert.deepEqual(packets, [{ id: 1, x: 0, y: 280, scrollRevision: 1 }])
  } finally {
    scrolling.dispose(); t.mock.timers.reset(); await browser.happyDOM.close()
  }
})

test('snapshot scroll restoration is not relayed as new viewer input', async t => {
  const { browser, element, packets, bind, scroll } = fixture()
  element.scrollTop = 160
  const scrolling = bind()
  t.mock.timers.enable({ apis: ['setTimeout'] })
  try {
    element.dispatchEvent(new browser.Event('scroll'))
    t.mock.timers.tick(60)
    assert.deepEqual(packets, [])
    scroll(200)
    t.mock.timers.tick(60)
    assert.deepEqual(packets, [{ id: 1, x: 0, y: 200, scrollRevision: 1 }])
  } finally {
    scrolling.dispose(); t.mock.timers.reset(); await browser.happyDOM.close()
  }
})
