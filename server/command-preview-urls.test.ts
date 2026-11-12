import assert from 'node:assert/strict'
import test from 'node:test'
import { addCommandPreviewUrls, commandPreviewUrls } from './command-preview-urls.ts'

test('local HTTP addresses are extracted from terminal output without credentials or external destinations', () => {
  assert.deepEqual(commandPreviewUrls(`
    Local: http://localhost:5173/
    Network: http://0.0.0.0:3000/app/
    IPv6: https://[::1]:4443/
    wildcard IPv6: http://[::]:8080/
    again http://localhost:5173/
    http://127.0.0.1:8888/path?token=secret
    http://localhost:8888/#token
    http://secret@localhost:3000/
    http://localhost.evil.test:1234/
    http://example.test:8000/
    ftp://localhost:42/
  `), ['http://localhost:5173/', 'http://localhost:8080/', 'https://[::1]:4443/', 'http://localhost:3000/app/'])
})

test('terminal captures use bounded parallelism and receive a real process timeout', async () => {
  const buttons = Array.from({ length: 25 }, (_, i) => ({ session: String(i), running: true }))
  let active = 0, peak = 0
  const result = await addCommandPreviewUrls(buttons, async (_session, timeout) => {
    assert.ok(timeout > 0 && timeout <= 800)
    active++
    peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 2))
    active--
    return 'Local: http://localhost:5173/'
  })
  assert.equal(peak, 4)
  assert.equal(result.length, buttons.length)
  assert.ok(result.every(button => button.previewUrls[0] === 'http://localhost:5173/'))
})

test('results are bounded and prefer newer local terminal output', () => {
  const output = Array.from({ length: 10 }, (_, i) => `http://localhost:${3000 + i}/`).join('\n')
  assert.deepEqual(commandPreviewUrls(output), [3009, 3008, 3007, 3006, 3005].map(port => `http://localhost:${port}/`))
  assert.deepEqual(commandPreviewUrls('xhttp://localhost:3000/'), [])
  assert.deepEqual(commandPreviewUrls('Local: http://localhost:5173/\u001b[0m'), ['http://localhost:5173/'])
})

test('only live command sessions are captured; capture failures do not block other commands', async () => {
  const captured: string[] = []
  const buttons = [{ session: 'a', running: true }, { session: 'b', running: true }, { session: 'c', running: false }]
  const result = await addCommandPreviewUrls(buttons, async session => {
    captured.push(session)
    if (session === 'b') throw new Error('session disappeared')
    return 'Local: http://127.0.0.1:3000/'
  })
  assert.deepEqual(captured, ['a', 'b'])
  assert.deepEqual(result.map(item => item.previewUrls), [['http://127.0.0.1:3000/'], [], []])
})

test('terminal escape sequences do not become part of a web address', () => {
  assert.deepEqual(commandPreviewUrls('Local: \x1b[32mhttp://localhost:5173/\x1b[0m'), ['http://localhost:5173/'])
})
