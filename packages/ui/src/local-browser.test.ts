import assert from 'node:assert/strict'
import test from 'node:test'
import { localBrowserUrl } from './local-browser.ts'

test('normalizes only loopback HTTP URLs while preserving paths, queries and fragments', () => {
  for (const [raw, expected] of [
    ['localhost:5173/nested?a=1#section', 'http://localhost:5173/nested?a=1#section'],
    ['http://localhost:3000', 'http://localhost:3000/'],
    ['https://LOCALHOST:8443/auth?state=x#done', 'https://localhost:8443/auth?state=x#done'],
    ['127.12.34.56:8080/path', 'http://127.12.34.56:8080/path'],
    ['[::1]:5001/path', 'http://[::1]:5001/path'],
    ['http://[::1]/', 'http://[::1]/'],
  ]) assert.equal(localBrowserUrl(raw), expected)
})

test('does not intercept external URLs, credentials, non-HTTP schemes or invalid ports', () => {
  for (const raw of [
    'https://example.com/localhost:3000', 'https://localhost.example.com:3000', 'http://192.168.1.1:3000',
    'javascript:alert(1)', 'ftp://localhost:3000', '//localhost:3000', '/3000',
    'http://user:secret@localhost:3000', 'http://@localhost:3000', 'http://localhost:0',
    'localhost:65536', 'localhost:abc', 'http://localhost:', '127.999.0.1:3000', 'http://localhost:3000/a b', '',
  ]) assert.equal(localBrowserUrl(raw), null, raw)
})
