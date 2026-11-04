import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { Window } from 'happy-dom'
import { DOM_BROWSER_COMPAT_SCRIPT } from './dom-browser-compat.ts'

const snapshotBundle = fs.readFileSync(path.join(path.dirname(createRequire(import.meta.url).resolve('rrweb-snapshot')), 'rrweb-snapshot.umd.cjs'), 'utf8')
type SnapshotNode = { tagName?: string; attributes?: Record<string, string>; childNodes?: SnapshotNode[] }

function fixture(t: TestContext, rawHref = true) {
  const window = new Window({ url: 'http://localhost:8080/signin', settings: { disableCSSFileLoading: true } })
  const prototype = window.HTMLLinkElement.prototype
  const original = Object.getOwnPropertyDescriptor(prototype, 'href')!
  if (rawHref) Object.defineProperty(prototype, 'href', {
    ...original,
    get() { return this.getAttribute('href') ?? '' },
  })
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'href')!
  t.after(async () => {
    Object.defineProperty(prototype, 'href', original)
    await window.happyDOM.close()
  })
  const apply = () => window.eval(DOM_BROWSER_COMPAT_SCRIPT)
  return { window, prototype, descriptor, apply }
}

function linkNode(node: SnapshotNode): SnapshotNode | undefined {
  if (node.tagName === 'link') return node
  for (const child of node.childNodes ?? []) {
    const match = linkNode(child)
    if (match) return match
  }
}

test('compatibility restores rrweb external stylesheet capture with an Obscura raw href getter', async t => {
  const { window, apply } = fixture(t)
  window.document.head.innerHTML = '<style>body { font-family: sans-serif; color: red; }</style><link rel="stylesheet" href="/assets/app.css">'
  const link = window.document.querySelector('link')!
  const style = window.document.querySelector('style')!
  const sheet = style.sheet!
  // Model a loaded external sheet without requesting a network resource.
  Object.defineProperty(sheet, 'href', { value: 'http://localhost:8080/assets/app.css' })
  Object.defineProperty(link, 'sheet', { get: () => sheet })
  Object.defineProperty(window.document, 'styleSheets', { get: () => [sheet] })
  style.remove()
  window.eval(snapshotBundle)
  const snapshot = () => window.eval('rrwebSnapshot.snapshot(document, { inlineStylesheet: true })') as SnapshotNode

  assert.equal(link.href, '/assets/app.css')
  const before = linkNode(snapshot())!
  assert.equal(before.attributes?._cssText, undefined)
  assert.equal(before.attributes?.rel, 'stylesheet')

  apply()
  assert.equal(link.href, 'http://localhost:8080/assets/app.css')
  const after = linkNode(snapshot())!
  assert.match(after.attributes?._cssText ?? '', /font-family:\s*sans-serif/)
  assert.match(after.attributes?._cssText ?? '', /color:\s*red/)
  assert.equal(after.attributes?.href, undefined)
  assert.equal(after.attributes?.rel, undefined)
})

test('compatibility preserves the native setter and follows href attributes and document base changes', t => {
  const { window, apply } = fixture(t)
  const link = window.document.createElement('link')
  apply()
  link.href = 'assets/first.css'
  assert.equal(link.getAttribute('href'), 'assets/first.css')
  assert.equal(link.href, 'http://localhost:8080/assets/first.css')
  link.setAttribute('href', '../second.css')
  assert.equal(link.href, 'http://localhost:8080/second.css')
  window.document.head.innerHTML = '<base href="https://cdn.example.test/theme/">'
  assert.equal(link.href, 'https://cdn.example.test/second.css')
  link.href = 'third.css'
  assert.equal(link.href, 'https://cdn.example.test/theme/third.css')
  window.document.querySelector('base')!.setAttribute('href', 'https://static.example.test/styles/')
  assert.equal(link.href, 'https://static.example.test/styles/third.css')
})

test('compatibility preserves missing and malformed href behavior', t => {
  const { window, apply } = fixture(t)
  const link = window.document.createElement('link')
  assert.equal(link.href, '')
  apply()
  assert.equal(link.href, '')
  assert.equal(link.hasAttribute('href'), false)
  link.setAttribute('href', 'http://[invalid')
  assert.equal(link.href, 'http://[invalid')
  link.removeAttribute('href')
  assert.equal(link.href, '')
})

test('compatibility retains descriptor flags and setter when applied repeatedly', t => {
  const { window, prototype, descriptor, apply } = fixture(t)
  apply()
  const patched = Object.getOwnPropertyDescriptor(prototype, 'href')!
  assert.equal(patched.configurable, descriptor.configurable)
  assert.equal(patched.enumerable, descriptor.enumerable)
  assert.equal(patched.set, descriptor.set)
  apply()
  const repeated = Object.getOwnPropertyDescriptor(prototype, 'href')!
  assert.equal(repeated.configurable, descriptor.configurable)
  assert.equal(repeated.enumerable, descriptor.enumerable)
  assert.equal(repeated.set, descriptor.set)
  const link = window.document.createElement('link')
  link.href = '/app.css'
  assert.equal(link.href, 'http://localhost:8080/app.css')
})

test('compatibility preserves already standard absolute href behavior', t => {
  const { window, apply } = fixture(t, false)
  const link = window.document.createElement('link')
  link.href = '/app.css'
  const before = link.href
  apply()
  assert.equal(link.href, before)
  assert.equal(link.href, 'http://localhost:8080/app.css')
  link.href = 'https://cdn.example.test/app.css'
  assert.equal(link.href, 'https://cdn.example.test/app.css')
})
