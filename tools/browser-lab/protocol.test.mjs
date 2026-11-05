import test from 'node:test'
import assert from 'node:assert/strict'
import { ENGINES, navigationTarget, parseCommand, viewerHostnames } from './protocol.mjs'

const command = (value, viewport) => parseCommand(JSON.stringify(value), viewport)
const pointer = { type: 'pointer', action: 'down', x: 100, y: 80, button: 'left', clickCount: 1 }

test('navigation allows local Mew and HTTPS authentication pages', () => {
  assert.equal(navigationTarget('http://127.0.0.1:5000/'), 'http://127.0.0.1:5000/')
  assert.equal(navigationTarget('http://localhost:5000/settings?q=browser'), 'http://localhost:5000/settings?q=browser')
  assert.equal(navigationTarget('https://accounts.google.com/ServiceLogin'), 'https://accounts.google.com/ServiceLogin')
})

test('navigation rejects non-web schemes and embedded credentials', () => {
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,test', 'ftp://example.com/',
    'https://user:password@example.com/', 'https://user@example.com/', 'https://%75ser@example.com/']) {
    assert.throws(() => navigationTarget(url), undefined, url)
  }
  assert.throws(() => navigationTarget('not a URL'))
  assert.throws(() => navigationTarget('https://example.com/' + 'x'.repeat(8192)))
})

test('all lab listeners reject recursive navigation including loopback aliases', () => {
  for (const engine of ENGINES) {
    for (const host of ['localhost', '127.0.0.1', '[::1]', '127.1', '2130706433']) {
      assert.throws(() => navigationTarget(`http://${host}:${engine.port}/`), undefined, `${host}:${engine.port}`)
    }
  }
  assert.equal(navigationTarget('https://example.com:5600/'), 'https://example.com:5600/')
})

test('wire byte limit rejects oversized Unicode payload before text character limit', () => {
  const allowed = { type: 'text', text: 'a'.repeat(16384) }
  assert.deepEqual(command(allowed), allowed)
  const oversized = JSON.stringify({ type: 'text', text: '가'.repeat(9000) })
  assert.ok(oversized.length < 16384)
  assert.throws(() => parseCommand(oversized), /입력 크기/)
  assert.throws(() => parseCommand(Buffer.from('x'.repeat(24 * 1024 + 1))), /입력 크기/)
})

test('pointer coordinates are finite and bounded by the current remote viewport', () => {
  assert.deepEqual(command(pointer, { width: 200, height: 100 }), pointer)
  for (const coordinates of [{ x: -1 }, { y: -0.1 }, { x: 201 }, { y: 101 }, { x: '100' }, { x: null }]) {
    assert.throws(() => command({ ...pointer, ...coordinates }, { width: 200, height: 100 }))
  }
  assert.throws(() => parseCommand('{"type":"pointer","action":"down","x":1e400,"y":80,"button":"left"}'))
  assert.throws(() => command({ ...pointer, action: 'click' }))
  assert.throws(() => command({ ...pointer, button: 'extra' }))
})

test('key modifiers and text have bounded, explicit types', () => {
  const key = { type: 'key', key: ' ', ctrlKey: false, shiftKey: true }
  assert.deepEqual(command(key), key)
  assert.deepEqual(command({ type: 'text', text: '한글🙂\nline two' }), { type: 'text', text: '한글🙂\nline two' })
  for (const invalid of [
    { type: 'key', key: '' }, { type: 'key', key: 'x'.repeat(65) }, { type: 'key', key: 'Enter', ctrlKey: 'true' },
    { type: 'text', text: 42 }, { type: 'text', text: 'x'.repeat(16385) },
  ]) assert.throws(() => command(invalid))
})

test('invalid wire data and unbounded wheel input are rejected', () => {
  for (const raw of ['{', 'null', '42', '[]', '{"type":"unknown"}']) assert.throws(() => parseCommand(raw))
  const wheel = { type: 'wheel', x: 10, y: 10, deltaX: 0, deltaY: 120 }
  assert.deepEqual(command(wheel), wheel)
  assert.throws(() => command({ ...wheel, deltaY: 10001 }))
  assert.throws(() => command({ ...wheel, deltaY: '120' }))
})


test('explicit viewer hosts accept tailnet names and reject URL components', () => {
  assert.deepEqual(viewerHostnames(['100.64.0.7', 'LAB.example.ts.net']), ['100.64.0.7', 'lab.example.ts.net'])
  assert.deepEqual(viewerHostnames(), [])
  for (const hosts of ['lab.example.ts.net', [null], ['lab.example.ts.net:5600'], ['lab.example.ts.net/path'], ['user@lab.example.ts.net'], ['lab.example.ts.net?x=1'], ['lab.example.ts.net#x']]) assert.throws(() => viewerHostnames(hosts))
})

test('configured viewer addresses cannot be nested in any browser lab engine', () => {
  const viewerHosts = ['100.64.0.7', 'lab.example.ts.net']
  for (const host of viewerHosts) for (const engine of ENGINES) {
    assert.throws(() => command({ type: 'navigate', url: `http://${host}:${engine.port}/` }, { viewerHosts }), /비교 화면/)
  }
  assert.equal(navigationTarget('http://100.64.0.7:5000/', viewerHosts), 'http://100.64.0.7:5000/')
})
