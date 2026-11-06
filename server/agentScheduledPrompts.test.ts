import assert from 'node:assert/strict'
import fs from 'node:fs'
import { registerHooks } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { AgentHostCommand } from './agentHost.ts'
import type { AgentExecutionOptions } from '../shared/agent-execution-options.ts'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-agent-schedule-'))
process.env.MEW_DATA_DIR = path.join(directory, 'data')
process.env.MEW_WORKSPACE = path.join(directory, 'workspace')
fs.mkdirSync(process.env.MEW_DATA_DIR)
fs.mkdirSync(process.env.MEW_WORKSPACE)
const file = path.join(process.env.MEW_DATA_DIR, 'agent-scheduled-prompts.json')
const schedulerUrl = new URL('./agentScheduledPrompts.ts', import.meta.url).href
const accountUrl = new URL('./agent-account-settings.ts', import.meta.url).href
const transportUrl = `data:text/javascript,${encodeURIComponent(`
  import { agentSettingsAccount } from ${JSON.stringify(accountUrl)};
  export const connections = [];
  export async function connectAgentHost(runtime, tab, cwd, handlers, sessionId) {
    const connection = { runtime, tab, cwd, sessionId, account: agentSettingsAccount(), messages: [], closed: false };
    connections.push(connection);
    return { send(message) { connection.messages.push(message) }, close() { connection.closed = true } };
  }
`)}`
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === schedulerUrl && specifier === './agentHost.ts') return { url: transportUrl, shortCircuit: true }
    return nextResolve(specifier, context)
  },
})
const transport = await import(transportUrl) as { connections: Array<{
  runtime: string; tab: string; cwd: string; sessionId: string; account: string | null; messages: AgentHostCommand[]; closed: boolean
}> }
const { scheduleAgentPrompt, updateAgentScheduledPrompt, listAgentScheduledPrompts, startAgentScheduledPrompts, AgentScheduledPromptError } = await import('./agentScheduledPrompts.ts')
const { runWithAgentAccount } = await import('./agent-account-settings.ts')
const scope = { runtime: 'codex', tab: 'scheduled-tab', cwd: process.env.MEW_WORKSPACE }
const input = () => ({ ...scope, sessionId: 'saved-session', text: 'Verify the scheduled change', skills: [], at: new Date(Date.now() + 60_000).toISOString() })
const saved = () => JSON.parse(fs.readFileSync(file, 'utf8')) as import('./agentScheduledPrompts.ts').AgentScheduledPrompt[]
function reset() {
  fs.writeFileSync(file, '[]')
  startAgentScheduledPrompts()
  transport.connections.length = 0
}
test.after(() => {
  reset()
  hooks.deregister()
  fs.rmSync(directory, { recursive: true, force: true })
})
test.beforeEach(reset)

test('one-time schedules validate and persist independent execution choices while retaining legacy omissions', () => {
  const execution = { build: false, deploy: true }
  const job = scheduleAgentPrompt({ ...input(), execution })
  execution.build = true
  assert.deepEqual(job.execution, { build: false, deploy: true }, 'saved request captures its own values')
  assert.deepEqual(saved()[0].execution, { build: false, deploy: true })
  assert.deepEqual(listAgentScheduledPrompts(scope)[0].execution, { build: false, deploy: true })
  const legacy = scheduleAgentPrompt(input())
  assert.equal(Object.hasOwn(legacy, 'execution'), false)
  assert.equal(Object.hasOwn(saved()[1], 'execution'), false)
  for (const execution of [null, [], {}, { build: false }, { build: 'false', deploy: false }, { build: false, deploy: false, extra: true }]) {
    assert.throws(() => scheduleAgentPrompt({ ...input(), execution }), AgentScheduledPromptError)
  }
  assert.equal(saved().length, 2, 'invalid requests do not mutate the schedule')
})

test('editing or rescheduling retains captured execution unless explicitly replaced', () => {
  const job = scheduleAgentPrompt({ ...input(), execution: { build: false, deploy: true } })
  const edited = updateAgentScheduledPrompt({ ...input(), id: job.id, text: 'Edited scheduled request', at: new Date(Date.now() + 90_000).toISOString() })
  assert.deepEqual(edited.execution, { build: false, deploy: true })
  assert.equal(saved()[0].text, 'Edited scheduled request')
  assert.deepEqual(saved()[0].execution, { build: false, deploy: true })
  const replaced = updateAgentScheduledPrompt({ ...input(), id: job.id, execution: { build: true, deploy: false } })
  assert.deepEqual(replaced.execution, { build: true, deploy: false })
  assert.throws(() => updateAgentScheduledPrompt({ ...input(), id: job.id, execution: { build: true } }), AgentScheduledPromptError)
  assert.deepEqual(saved()[0].execution, { build: true, deploy: false })
  const legacy = scheduleAgentPrompt(input())
  const legacyEdit = updateAgentScheduledPrompt({ ...input(), id: legacy.id, text: 'Legacy edit' })
  assert.equal(Object.hasOwn(legacyEdit, 'execution'), false)
})

test('restored schedules deliver their saved execution and account through the actual timer dispatch', { timeout: 5_000 }, async () => {
  const choices: AgentExecutionOptions[] = [
    { build: true, deploy: false }, { build: false, deploy: true },
    { build: false, deploy: false }, { build: true, deploy: true },
  ]
  for (const execution of choices) runWithAgentAccount('schedule@example.test', () => scheduleAgentPrompt({ ...input(), execution }))
  scheduleAgentPrompt(input())
  fs.writeFileSync(file, JSON.stringify(saved().map(job => ({ ...job, at: new Date(Date.now() - 1_000).toISOString() }))))
  startAgentScheduledPrompts()
  const deadline = Date.now() + 3_000
  while (transport.connections.length < 5 || saved().length) {
    assert.ok(Date.now() < deadline, 'restored schedules should dispatch and leave the pending file')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.equal(transport.connections.length, 5)
  for (const [index, connection] of transport.connections.entries()) {
    assert.equal(connection.closed, true)
    assert.equal(connection.runtime, scope.runtime)
    assert.equal(connection.tab, scope.tab)
    assert.equal(connection.cwd, scope.cwd)
    assert.equal(connection.sessionId, 'saved-session')
    assert.equal(connection.account, index < choices.length ? 'schedule@example.test' : null)
    assert.equal(connection.messages.length, 1)
    const message = connection.messages[0]
    assert.equal(message.type, 'prompt')
    if (message.type !== 'prompt') continue
    assert.equal(message.automatic, true)
    assert.equal(message.text, input().text)
    assert.equal(message.promptText, message.text)
    if (index < choices.length) assert.deepEqual(message.settings, { model: '', thinking: '', permission: '', execution: choices[index] })
    else assert.equal(Object.hasOwn(message, 'settings'), false, 'legacy schedules retain existing guidance behavior')
  }
})
