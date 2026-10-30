import test from 'node:test'
import assert from 'node:assert/strict'
import { configurePortPreviewBaseUrl } from './port-preview-url.ts'
import { publicShareUrl } from './public-share-url.ts'

const token = 'a'.repeat(43)

test('public shares preserve localhost/custom origins and validated public device paths', t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location')
  t.after(() => { configurePortPreviewBaseUrl(); if (previous) Object.defineProperty(globalThis, 'location', previous); else Reflect.deleteProperty(globalThis, 'location') })
  for (const origin of ['http://localhost:5000', 'https://workspace.example.test']) {
    Object.defineProperty(globalThis, 'location', { configurable: true, value: new URL(origin + '/?project=private') })
    configurePortPreviewBaseUrl()
    assert.equal(publicShareUrl('f', token), `${origin}/share/f/${token}`)
  }
  configurePortPreviewBaseUrl('https://mew.run/someone/laptop')
  assert.equal(publicShareUrl('d', token), `https://mew.run/someone/laptop/share/d/${token}`)
})

test('invalid remote bases and share identifiers fail without exposing the internal app origin', t => {
  t.after(() => configurePortPreviewBaseUrl())
  for (const base of [null, 'https://app.mew.run/launch/token/extra', 'https://mew.run/someone/laptop?session=private']) {
    configurePortPreviewBaseUrl(base)
    assert.throws(() => publicShareUrl('f', token), /기기 주소/)
  }
  configurePortPreviewBaseUrl('https://mew.run/someone/laptop')
  for (const id of ['', '../private', 'a'.repeat(42), 'a'.repeat(44), 'a'.repeat(42) + '?']) assert.throws(() => publicShareUrl('f', id), /공개 링크/)
})
