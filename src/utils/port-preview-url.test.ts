import test from 'node:test'
import assert from 'node:assert/strict'
import { configurePortPreviewBaseUrl, localAppPreviewUrl, portPreviewUrl } from './port-preview-url.ts'

test('local preview URLs keep the current domain and Mew server port', t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location')
  Object.defineProperty(globalThis, 'location', { configurable: true, value: new URL('http://100.64.0.1:5000/?project=demo') })
  configurePortPreviewBaseUrl()
  t.after(() => { configurePortPreviewBaseUrl(); if (previous) Object.defineProperty(globalThis, 'location', previous); else Reflect.deleteProperty(globalThis, 'location') })
  assert.equal(portPreviewUrl(3333), 'http://100.64.0.1:5000/3333')
  assert.equal(localAppPreviewUrl('http://localhost:3333/settings?tab=profile#name'), 'http://100.64.0.1:5000/3333/settings?tab=profile#name')
  assert.equal(localAppPreviewUrl('[::1]:5173/'), 'http://100.64.0.1:5000/5173/')
  assert.equal(localAppPreviewUrl('http://127.12.34.56/'), 'http://100.64.0.1:5000/80/')
  for (const value of ['https://example.com/', '//localhost:3333/', 'http://user:secret@localhost:3333/', 'localhost:0', 'localhost:65536']) assert.throws(() => localAppPreviewUrl(value), /localhost/)
  for (const port of [0, -1, 65536, 3333.5, Number.NaN]) assert.throws(() => portPreviewUrl(port), /포트/)
})

test('remote preview URLs use the public device address without launcher routes or credentials', t => {
  t.after(() => configurePortPreviewBaseUrl())
  configurePortPreviewBaseUrl('https://mew.run/saens/windows/')
  assert.equal(portPreviewUrl(5555), 'https://mew.run/saens/windows/5555')
  assert.equal(localAppPreviewUrl('127.0.0.1:5555/path?q=one%20two#part'), 'https://mew.run/saens/windows/5555/path?q=one%20two#part')
  configurePortPreviewBaseUrl('https://custom.example.test/user-1/home_2')
  assert.equal(portPreviewUrl(65535), 'https://custom.example.test/user-1/home_2/65535')
})

test('missing or malformed remote device URLs never produce links on the installed app origin', t => {
  t.after(() => configurePortPreviewBaseUrl())
  for (const value of [null, '', '/saens/windows', 'javascript:alert(1)', 'https://mew.run', 'https://mew.run/auth/login', 'https://mew.run/saens/windows/5555', 'https://mew.run/saens/windows?token=secret', 'https://mew.run/saens/windows?', 'https://mew.run/saens/windows#secret', 'https://user:password@mew.run/saens/windows', 'https://mew.run/saens/../windows', 'https://mew.run/saens/%77indows', 'https://mew.run\\evil.test/saens/windows', 'https://mew.run/saens/\nwindows']) {
    configurePortPreviewBaseUrl(value)
    assert.throws(() => portPreviewUrl(5555), /기기 주소/, String(value))
    assert.throws(() => localAppPreviewUrl('localhost:5555'), /기기 주소/, String(value))
  }
})
