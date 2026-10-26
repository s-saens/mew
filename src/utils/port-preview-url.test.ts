import test from 'node:test'
import assert from 'node:assert/strict'
import { configurePortPreviewBaseUrl, portPreviewUrl } from './port-preview-url.ts'

test('local preview URLs keep the current domain and Mew server port', t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location')
  Object.defineProperty(globalThis, 'location', { configurable: true, value: new URL('http://100.64.0.1:5000/?project=demo') })
  configurePortPreviewBaseUrl()
  t.after(() => { configurePortPreviewBaseUrl(); if (previous) Object.defineProperty(globalThis, 'location', previous); else Reflect.deleteProperty(globalThis, 'location') })
  assert.equal(portPreviewUrl(3333), 'http://100.64.0.1:5000/3333')
  for (const port of [0, -1, 65536, 3333.5, Number.NaN]) assert.throws(() => portPreviewUrl(port), /포트/)
})

test('remote preview URLs use the public device address without launcher routes or credentials', t => {
  t.after(() => configurePortPreviewBaseUrl())
  configurePortPreviewBaseUrl('https://mew.run/saens/windows/')
  assert.equal(portPreviewUrl(5555), 'https://mew.run/saens/windows/5555')
  configurePortPreviewBaseUrl('https://custom.example.test/user-1/home_2')
  assert.equal(portPreviewUrl(65535), 'https://custom.example.test/user-1/home_2/65535')
})

test('missing or malformed remote device URLs never produce links on the installed app origin', t => {
  t.after(() => configurePortPreviewBaseUrl())
  for (const value of [null, '', '/saens/windows', 'javascript:alert(1)', 'https://mew.run', 'https://mew.run/auth/login', 'https://mew.run/saens/windows/5555', 'https://mew.run/saens/windows?token=secret', 'https://mew.run/saens/windows?', 'https://mew.run/saens/windows#secret', 'https://user:password@mew.run/saens/windows', 'https://mew.run/saens/../windows', 'https://mew.run/saens/%77indows', 'https://mew.run\\evil.test/saens/windows', 'https://mew.run/saens/\nwindows']) {
    configurePortPreviewBaseUrl(value)
    assert.throws(() => portPreviewUrl(5555), /기기 주소/, String(value))
  }
})
