import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'rolldown'
import type { PresenceView, WorkspacePresence } from './workspace-presence.ts'

test('one account presence connection routes root events and resets legacy focus without duplicating subscriptions', async t => {
  const originals = new Map<string, PropertyDescriptor | undefined>()
  let close = () => {}
  for (const [key, value] of Object.entries({ window: new EventTarget(), document: Object.assign(new EventTarget(), { hidden: false }),
    location: { protocol: 'https:', host: 'presence.test' }, WebSocket: { OPEN: 1 } })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  }
  t.after(() => { close(); for (const [key, original] of originals) { if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key) } })
  const source = new URL('./workspace-presence.ts', import.meta.url).pathname
  const bundle = await build({ input: source, write: false, platform: 'browser', output: { format: 'esm' } })
  const { WorkspacePresence: Connection } = await import(`data:text/javascript;base64,${Buffer.from(bundle.output.find(item => item.type === 'chunk')!.code).toString('base64')}`) as { WorkspacePresence: typeof WorkspacePresence }
  const messages: Record<string, unknown>[] = []
  let sockets = 0, closed = 0
  const socket = { readyState: 1, send(data: string) { messages.push(JSON.parse(data)) }, close() { closed++ },
    onopen: null as (() => void) | null, onmessage: null as ((event: { data: string }) => void) | null }
  const connection = new Connection(() => { sockets++; return socket as unknown as WebSocket })
  close = () => connection.close()
  connection.start()
  const events = new Map<string, string[]>(), colors = new Map<string, Record<string, string[]>>()
  const view = (id: string, active: boolean, root?: string, runningAgents = 0): PresenceView => ({
    active, scope: root ? { workspacePath: root, projectPath: root } : undefined,
    focus: { path: '.workspace:same.md', project: '.workspace', workspaceLabel: id, color: id, runningAgents },
    tree: () => events.set(id, [...events.get(id) ?? [], 'tree']),
    workspace: () => events.set(id, [...events.get(id) ?? [], 'workspace']),
    receive: value => colors.set(id, value),
  })
  const a = {}, b = {}, duplicate = {}, legacy = {}
  connection.register(a, view('a', true, '/a', 2))
  connection.register(b, view('b', false, '/b', 3))
  connection.register(duplicate, view('duplicate', false, '/a', 2))
  socket.onopen?.()
  assert.equal(sockets, 1)
  assert.equal(messages.filter(message => message.type === 'focus').at(-1)?.runningAgents, 5, 'one browser reports all project work without double-counting a retained view')
  assert.deepEqual(messages.filter(message => message.type === 'workspace-subscriptions').at(-1)?.scopes, [
    { workspacePath: '/a', projectPath: '/a' }, { workspacePath: '/b', projectPath: '/b' },
  ])
  const receive = (value: unknown) => socket.onmessage?.({ data: JSON.stringify(value) })
  receive({ type: 'participants', participants: { '.workspace:same.md': ['legacy'] },
    workspaceParticipants: { '/a': { '.workspace:same.md': ['a'], 'docs:same.md': ['other'] }, '/b': { '.workspace:same.md': ['b'] } } })
  assert.deepEqual(colors.get('a'), { 'same.md': ['a'] })
  assert.deepEqual(colors.get('b'), { 'same.md': ['b'] })
  receive({ type: 'tree', workspacePath: '/a' })
  receive({ type: 'workspace', workspacePath: '/b' })
  receive({ type: 'workspace' })
  assert.deepEqual(events.get('a'), ['tree'])
  assert.deepEqual(events.get('b'), ['workspace'])
  receive({ type: 'tree' })
  assert.deepEqual(events.get('a'), ['tree', 'tree'], 'global ignore changes refresh every root')
  assert.deepEqual(events.get('b'), ['workspace', 'tree'])
  connection.register(a, view('a', false, '/a'))
  connection.register(legacy, view('legacy', true))
  assert.equal(messages.filter(message => message.type === 'focus').at(-1)?.workspaceScope, null)
  assert.deepEqual(colors.get('legacy'), { 'same.md': ['legacy'] })
  connection.remove(a); connection.remove(duplicate)
  assert.deepEqual(messages.filter(message => message.type === 'workspace-subscriptions').at(-1)?.scopes, [{ workspacePath: '/b', projectPath: '/b' }])
  connection.close()
  const count = messages.length
  window.dispatchEvent(new Event('online'))
  assert.equal(messages.length, count, 'closing removes account event listeners')
  assert.equal(closed, 1)
})
