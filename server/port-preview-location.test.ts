import test from 'node:test'
import assert from 'node:assert/strict'
import { runInNewContext } from 'node:vm'
import { rewritePreviewLocation } from './port-preview-location.ts'

test('location rewriting preserves ASI, shorthand keys, literals, templates and local bindings', () => {
  const source = `
// window.location must stay in this comment
const literal = 'window.location';
const pattern = /window.location/;
const template = \`window.location: \${location.pathname}\`;
const items = []
window.items = items;
const snapshot = { location, window, self, globalThis, document };
function shadow(window, location, document, self, globalThis) { return { window, location, document, self, globalThis }; }
const scoped = shadow(1, 2, 3, 4, 5);
const result = [snapshot.location.pathname, template, scoped.location, literal, pattern.source, snapshot.window === window, document.defaultView === window];
result;
`
  const transformed = rewritePreviewLocation(source)
  for (const original of ['// window.location must stay in this comment', "'window.location'", '/window.location/', 'function shadow(window, location, document, self, globalThis) { return { window, location, document, self, globalThis }; }']) assert.ok(transformed.includes(original), original)
  const virtual = { location: { pathname: '/deep' } } as Record<string, unknown>
  virtual.window = virtual; virtual.self = virtual; virtual.globalThis = virtual; virtual.document = { defaultView: virtual }
  const result = runInNewContext(transformed, { __MEW_PORT_PREVIEW_GLOBAL__: virtual, document: virtual.document })
  assert.deepEqual(Array.from(result), ['/deep', 'window.location: /deep', 2, 'window.location', 'window.location', true, true])
})

test('location rewriting avoids locally shadowed helper roots and supports shorthand assignment', () => {
  const native = { Object, __MEW_PORT_PREVIEW_GLOBAL__: { location: { pathname: '/virtual' } } }
  const source = `function read(globalThis) { return location.pathname; } const result = read({}); ({location} = {location: '/assigned'}); result;`
  assert.equal(runInNewContext(rewritePreviewLocation(source), { window: native, __MEW_PORT_PREVIEW_GLOBAL__: native.__MEW_PORT_PREVIEW_GLOBAL__ }), '/virtual')
  assert.equal(native.__MEW_PORT_PREVIEW_GLOBAL__.location, '/assigned')
})

test('worker globals fall back to their native values without a document runtime', () => {
  const code = rewritePreviewLocation('[typeof window, typeof document, globalThis === self, location.pathname]')
  const context = { location: { pathname: '/worker.js' } } as Record<string, unknown>
  context.self = context
  assert.deepEqual(Array.from(runInNewContext(code, context)), ['undefined', 'undefined', true, '/worker.js'])
})

test('constructor references retain new precedence and ASI', () => {
  const virtual = { Event, URL } as Record<string, unknown>
  virtual.window = virtual
  const code = rewritePreviewLocation('const items = []\nnew window.Event("probe"); [new window.URL("https://example.test").hostname, new globalThis.Event("probe").type]')
  assert.deepEqual(Array.from(runInNewContext(code, { __MEW_PORT_PREVIEW_GLOBAL__: virtual })), ['example.test', 'probe'])
})

test('module imports, exports and invalid syntax are preserved by location rewriting', () => {
  const source = 'import { location as local } from "/dep.js"; export { local as location }; export const value = window.location.pathname;'
  const result = rewritePreviewLocation(source)
  assert.ok(result.startsWith('import { location as local } from "/dep.js"; export { local as location };'))
  assert.ok(result.includes(').window.location.pathname'))
  assert.equal(rewritePreviewLocation('window.location ???'), 'window.location ???')
})
