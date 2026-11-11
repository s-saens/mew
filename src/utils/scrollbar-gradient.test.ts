import test from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import { startScrollbarGradientTracking } from './scrollbar-gradient.ts'

test('scrollbar highlights batch geometry reads before writes and skip unchanged writes', () => {
  const win = new Window()
  const keys = ['document', 'HTMLElement', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']
  const original = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  let frame: FrameRequestCallback | undefined
  const operations: string[] = []
  const values: Record<string, unknown> = { document: win.document, HTMLElement: win.HTMLElement,
    getComputedStyle: () => ({ direction: 'ltr' }),
    requestAnimationFrame: (callback: FrameRequestCallback) => { frame = callback; return 1 }, cancelAnimationFrame: () => {} }
  keys.forEach(key => Object.defineProperty(globalThis, key, { value: values[key], configurable: true }))
  let stop: (() => void) | undefined
  try {
    const elements = [win.document.createElement('div'), win.document.createElement('div')]
    for (const element of elements) {
      win.document.body.append(element)
      for (const [key, value] of Object.entries({ scrollTop: 50, scrollHeight: 200, clientHeight: 100, scrollLeft: 25, scrollWidth: 150, clientWidth: 100 })) {
        Object.defineProperty(element, key, { get() { operations.push('read'); return value } })
      }
      const setProperty = element.style.setProperty.bind(element.style)
      element.style.setProperty = (...args) => { operations.push('write'); setProperty(...args) }
    }
    stop = startScrollbarGradientTracking()
    for (const element of elements) element.dispatchEvent(new win.Event('scroll'))
    assert.ok(frame)
    frame(0)
    const firstWrite = operations.indexOf('write')
    assert.ok(firstWrite > 0)
    assert.ok(operations.slice(firstWrite).every(operation => operation === 'write'))
    for (const element of elements) {
      assert.equal(element.style.getPropertyValue('--mew-scrollbar-y'), '50%')
      assert.equal(element.style.getPropertyValue('--mew-scrollbar-x'), '50%')
    }
    operations.length = 0
    for (const element of elements) element.dispatchEvent(new win.Event('scroll'))
    frame(0)
    assert.ok(!operations.includes('write'), 'duplicate scroll positions do not invalidate styles')
  } finally {
    stop?.()
    keys.forEach((key, index) => { if (original[index]) Object.defineProperty(globalThis, key, original[index]!); else Reflect.deleteProperty(globalThis, key) })
    void win.happyDOM.close()
  }
})
