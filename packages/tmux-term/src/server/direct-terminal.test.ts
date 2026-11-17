import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { execFileSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import { WebSocket } from 'ws'
import { connectDirectTerminal, createDirectTerminal, directTerminalNames, directTerminalSpec, stopDirectTerminal } from './direct-terminal.ts'

class Client extends EventEmitter {
  readyState = WebSocket.OPEN
  output = ''
  code = 0
  terminated = false
  send(data: string) { this.output += data }
  close(code: number) { this.code = code; this.readyState = WebSocket.CLOSED; this.emit('close') }
  terminate() { this.terminated = true; this.readyState = WebSocket.CLOSED; this.emit('close') }
  input(data: string) { this.emit('message', Buffer.from(JSON.stringify({ type: 'input', data }))) }
  asSocket() { return this as unknown as WebSocket }
}

async function until(predicate: () => boolean) {
  for (let i = 0; i < 100 && !predicate(); i++) await delay(20)
  assert.ok(predicate(), 'timed out waiting for terminal output')
}

test('multiplexer commands use fixed arguments and shell needs no multiplexer', () => {
  assert.deepEqual(directTerminalSpec('zellij', 'fixture'), { command: 'zellij', args: ['attach', '--create', 'fixture'] })
  assert.deepEqual(directTerminalSpec('screen', 'fixture'), { command: 'screen', args: ['-D', '-RR', 'fixture'] })
  assert.notEqual(directTerminalSpec('shell', 'fixture').command, 'tmux')
})

test('direct shell receives its session environment', { skip: process.platform === 'win32', timeout: 10000 }, async () => {
  const name = `mewdirect-env-${process.pid}`
  createDirectTerminal(name, 'shell', process.cwd(), { ...process.env, MEW_TEST_TERMINAL_OWNER: 'owner-fixture' })
  try {
    const client = new Client()
    connectDirectTerminal(name, client.asSocket(), 80, 24, () => true)
    client.input('printf "owner=%s\\n" "$MEW_TEST_TERMINAL_OWNER"\r')
    await until(() => client.output.includes('owner=owner-fixture'))
  } finally { await stopDirectTerminal(name, 'shell') }
})

test('shell survives disconnection, shares output, replays it and stops on tab close', { skip: process.platform === 'win32', timeout: 10000 }, async () => {
  const name = `mewdirect-test-${process.pid}`
  createDirectTerminal(name, 'shell', process.cwd())
  try {
    const first = new Client(), second = new Client()
    connectDirectTerminal(name, first.asSocket(), 80, 24, () => true)
    connectDirectTerminal(name, second.asSocket(), 80, 24, () => true)
    first.input("printf 'direct_%s\\n' 'fixture'\r")
    await until(() => first.output.includes('direct_fixture') && second.output.includes('direct_fixture'))
    first.close(1000); second.close(1000)
    assert.ok(directTerminalNames().includes(name))
    const reopened = new Client()
    connectDirectTerminal(name, reopened.asSocket(), 80, 24, () => true)
    assert.match(reopened.output, /direct_fixture/)
    await stopDirectTerminal(name, 'shell')
    assert.equal(reopened.code, 4001)
    assert.ok(!directTerminalNames().includes(name))
  } finally { await stopDirectTerminal(name, 'shell') }
})

test('access is checked before replay and before subsequent input', { skip: process.platform === 'win32', timeout: 10000 }, async () => {
  const name = `mewdirect-access-${process.pid}`
  createDirectTerminal(name, 'shell', process.cwd())
  try {
    const denied = new Client()
    connectDirectTerminal(name, denied.asSocket(), 80, 24, () => false)
    assert.equal(denied.terminated, true)
    assert.equal(denied.output, '')
    let allowed = true
    const client = new Client()
    connectDirectTerminal(name, client.asSocket(), 80, 24, () => allowed)
    allowed = false
    client.input('echo forbidden\r')
    assert.equal(client.terminated, true)
  } finally { await stopDirectTerminal(name, 'shell') }
})

let screenAvailable = false
try { execFileSync('screen', ['--version'], { stdio: 'ignore' }); screenAvailable = true } catch { /* optional */ }
test('GNU Screen starts a named session, accepts input and terminates on close', { skip: !screenAvailable, timeout: 10000 }, async () => {
  const name = `mewdirect-screen-${process.pid}`
  createDirectTerminal(name, 'screen', process.cwd())
  try {
    const client = new Client()
    connectDirectTerminal(name, client.asSocket(), 80, 24, () => true)
    await delay(500)
    client.input("printf 'screen_%s\\n' 'fixture'\r")
    await until(() => client.output.includes('screen_fixture'))
    await stopDirectTerminal(name, 'screen')
    assert.equal(client.code, 4001)
  } finally {
    if (directTerminalNames().includes(name)) await stopDirectTerminal(name, 'screen')
  }
})
