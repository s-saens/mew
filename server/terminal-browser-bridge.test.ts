import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { promisify } from 'node:util'
import test from 'node:test'
import { WebSocket } from 'ws'
import { registerTerminalBrowserViewer } from '../packages/tmux-term/src/server/browser-requests.ts'
import { closeTerminalBrowserBridge, terminalBrowserBridge } from './terminal-browser-bridge.ts'

const exec = promisify(execFile)
class FakeSocket extends EventEmitter {
  readyState = WebSocket.OPEN
  sent: string[] = []
  send(message: string) { this.sent.push(message) }
}

test('browser helper forwards a validated URL to one authorized matching terminal viewer', { skip: process.platform === 'win32' }, async () => {
  const session = 'test-browser-bridge'
  const [env, same] = await Promise.all([terminalBrowserBridge(session, 'alice'), terminalBrowserBridge(session, 'alice')])
  assert.deepEqual(same, env, 'concurrent starts share one bridge')
  const alice = new FakeSocket(), other = new FakeSocket()
  let enabled = true
  registerTerminalBrowserViewer(session, other as unknown as WebSocket, () => 'bob')
  registerTerminalBrowserViewer(session, alice as unknown as WebSocket, () => enabled ? 'alice' : null)
  try {
    await exec(env.BROWSER!, ['https://example.test/login?state=private'], { env: { ...process.env, ...env } })
    assert.deepEqual(alice.sent.map(value => JSON.parse(value.slice(1))), [{ type: 'browser-open', url: 'https://example.test/login?state=private' }])
    assert.deepEqual(other.sent, [])
    await exec(env.BROWSER!, ['http://localhost:3000/callback?code=fixture'], { env: { ...process.env, ...env } })
    assert.equal(JSON.parse(alice.sent[1].slice(1)).url, 'http://localhost:3000/callback?code=fixture')
    await assert.rejects(exec(env.BROWSER!, ['file:///etc/passwd'], { env: { ...process.env, ...env } }))
    enabled = false
    await assert.rejects(exec(env.BROWSER!, ['http://localhost:3000/callback'], { env: { ...process.env, ...env } }))
    assert.equal(alice.sent.length, 2)
  } finally {
    alice.emit('close'); other.emit('close'); closeTerminalBrowserBridge(session)
  }
})
