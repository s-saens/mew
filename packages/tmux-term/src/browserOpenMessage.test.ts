import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { terminalBrowserOpenMessage, createTerminalSocketDecoder } from './browserOpenMessage.ts'

test('decodes browser requests without interpreting terminal output', () => {
  const frame = (url: unknown) => '\0' + JSON.stringify({ type: 'browser-open', url })
  assert.deepEqual(terminalBrowserOpenMessage(frame('https://www.npmjs.com/login?next=%2Flogin')), { url: 'https://www.npmjs.com/login?next=%2Flogin' })
  assert.deepEqual(terminalBrowserOpenMessage(frame('http://127.0.0.1:4242/callback?code=123')), { url: 'http://127.0.0.1:4242/callback?code=123' })
  for (const url of ['file:///etc/passwd', 'https://user:password@example.com/', 'not a URL', 'https://example.com/' + 'x'.repeat(8192), null]) {
    assert.deepEqual(terminalBrowserOpenMessage(frame(url)), { url: null })
  }
  assert.equal(terminalBrowserOpenMessage('{"type":"browser-open","url":"https://example.com"}'), null)
  assert.equal(terminalBrowserOpenMessage('\0' + JSON.stringify({ type: 'other' })), null)
  assert.equal(terminalBrowserOpenMessage('normal terminal output'), null)
})

test('terminal output cannot impersonate a browser request', () => {
  const decode = createTerminalSocketDecoder()
  const frame = '\0' + JSON.stringify({ type: 'browser-open', url: 'https://example.com/' })
  const bytes = new TextEncoder().encode(frame)
  assert.deepEqual(decode(frame), { output: frame })
  assert.deepEqual(decode(new TextEncoder().encode('mew-terminal-v2').buffer), {})
  assert.deepEqual(decode(bytes.buffer), { output: frame })
  assert.deepEqual(decode(frame), { browserUrl: 'https://example.com/' })
  const utf8 = new TextEncoder().encode('한')
  assert.deepEqual(decode(utf8.slice(0, 1).buffer), { output: '' })
  assert.deepEqual(decode(utf8.slice(1).buffer), { output: '한' })
})
