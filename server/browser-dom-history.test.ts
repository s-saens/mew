import assert from 'node:assert/strict'
import test from 'node:test'
import { DomBrowserHistory } from './browser-dom-history.ts'

test('distinct native pushState entries at the same URL can be retained', () => {
  const history = new DomBrowserHistory()
  history.record('https://example.test/start', 1)
  history.record('https://example.test/same', 1)
  history.record('https://example.test/same', 1, undefined, true)
  assert.equal(history.currentIndex, 2)
  const previous = history.target('back')!
  assert.equal(previous.entry.url, 'https://example.test/same')
  history.record(previous.entry.url, 1, previous.index)
  assert.equal(history.target('back')?.entry.url, 'https://example.test/start')
})

test('empty history and ignored blank documents have no toolbar targets', () => {
  const history = new DomBrowserHistory()
  history.record('', 1)
  history.record('about:blank', 1)
  assert.equal(history.current, undefined)
  assert.equal(history.currentIndex, -1)
  assert.equal(history.canGoBack, false)
  assert.equal(history.canGoForward, false)
  assert.equal(history.target('back'), undefined)
  assert.equal(history.target('forward'), undefined)
})

test('back and forward targets retain their runtime and do not change the current entry until recorded', () => {
  const history = new DomBrowserHistory()
  history.record('http://localhost:8080/first', 1)
  history.record('https://example.test/second', 2)
  const back = history.target('back')!
  assert.deepEqual(back, { index: 0, entry: { url: 'http://localhost:8080/first', runtimeId: 1 } })
  assert.equal(history.currentIndex, 1)
  assert.equal(history.canGoBack, true)
  assert.equal(history.canGoForward, false)
  history.record(back.entry.url, 3, back.index)
  assert.deepEqual(history.current, { url: 'http://localhost:8080/first', runtimeId: 3 })
  assert.equal(history.currentIndex, 0)
  assert.equal(history.canGoBack, false)
  assert.equal(history.canGoForward, true)
  const forward = history.target('forward')!
  assert.deepEqual(forward, { index: 1, entry: { url: 'https://example.test/second', runtimeId: 2 } })
  history.record(forward.entry.url, 4, forward.index)
  assert.deepEqual(history.current, { url: 'https://example.test/second', runtimeId: 4 })
  assert.equal(history.currentIndex, 1)
  assert.equal(history.canGoBack, true)
  assert.equal(history.canGoForward, false)
})

test('reload or redirect replacement updates the selected slot and preserves forward entries', () => {
  const history = new DomBrowserHistory()
  history.record('https://example.test/first', 1)
  history.record('https://example.test/second', 1)
  history.record('https://example.test/third', 2)
  history.record('https://example.test/second-redirected', 3, 1)
  history.record('https://example.test/second-redirected', 4, history.currentIndex)
  assert.deepEqual(history.current, { url: 'https://example.test/second-redirected', runtimeId: 4 })
  assert.equal(history.currentIndex, 1)
  assert.equal(history.canGoBack, true)
  assert.deepEqual(history.target('forward'), { index: 2, entry: { url: 'https://example.test/third', runtimeId: 2 } })
})

test('a new visit after going back discards the old forward branch', () => {
  const history = new DomBrowserHistory()
  history.record('https://example.test/first', 1)
  history.record('https://example.test/second', 1)
  history.record('https://example.test/third', 1)
  const back = history.target('back')!
  history.record(back.entry.url, back.entry.runtimeId, back.index)
  history.record('http://localhost:8080/new', 2)
  assert.equal(history.currentIndex, 2)
  assert.deepEqual(history.current, { url: 'http://localhost:8080/new', runtimeId: 2 })
  assert.equal(history.canGoForward, false)
  assert.equal(history.target('forward'), undefined)
  assert.deepEqual(history.target('back'), { index: 1, entry: { url: 'https://example.test/second', runtimeId: 1 } })
})

test('the same current URL refreshes its runtime without appending or losing forward history', () => {
  const history = new DomBrowserHistory()
  history.record('http://localhost:8080/first', 1)
  history.record('https://example.test/second', 2)
  history.record('http://localhost:8080/first', 3, 0)
  history.record('http://localhost:8080/first', 4)
  assert.deepEqual(history.current, { url: 'http://localhost:8080/first', runtimeId: 4 })
  assert.equal(history.currentIndex, 0)
  assert.equal(history.canGoBack, false)
  assert.equal(history.canGoForward, true)
  assert.deepEqual(history.target('forward'), { index: 1, entry: { url: 'https://example.test/second', runtimeId: 2 } })
})

test('invalid replacement indices leave the current slot and forward history intact', () => {
  const history = new DomBrowserHistory()
  assert.throws(() => history.record('https://example.test/invalid', 1, 0), RangeError)
  history.record('https://example.test/first', 1)
  history.record('https://example.test/second', 2)
  history.record('https://example.test/first', 1, 0)
  for (const index of [-1, 2, 0.5, NaN, Infinity]) {
    assert.throws(() => history.record('https://example.test/invalid', 99, index), RangeError)
    assert.deepEqual(history.current, { url: 'https://example.test/first', runtimeId: 1 })
    assert.equal(history.currentIndex, 0)
    assert.deepEqual(history.target('forward'), { index: 1, entry: { url: 'https://example.test/second', runtimeId: 2 } })
  }
})
