import './test-isolated-data.ts'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { AgentSession } from './agentAcp.ts'
import { composeRuntimePrompt, refreshSelectedRuntimePrompt, selectedRuntimePrompt } from './agentRuntimes.ts'
import { skillLibrary } from './skill-library.ts'
import { contextBlock, stripMewContext } from './project-context-text.ts'
import { skillLibraryPrompt, skillRuntimeEnvironment, skillRuntimeSessionOptions, type RuntimeSkillPolicy } from './skill-runtime-policy.ts'

const policy: RuntimeSkillPolicy = {
  enabled: [{ name: 'documentation', description: 'Write\nclear docs', path: '/mew/skills/documentation/SKILL.md' }],
  disabledNames: ['writing', 'writing'],
  excludedPaths: ['/native/skills/writing/SKILL.md', '/native/skills/writing/SKILL.md'],
}

test('Codex runtime overrides preserve unrelated config and suppress implicit native skills without mutating inputs', () => {
  const configured = { model: 'test-model', mcp_servers: { example: { url: 'http://localhost.invalid' } }, skills: { max_context_tokens: 1000, config: [{ name: 'writing', enabled: true }] } }
  const env = { PATH: '/test/bin', CODEX_CONFIG: JSON.stringify(configured) }
  const next = skillRuntimeEnvironment('codex', env, policy)
  assert.equal(next.PATH, env.PATH)
  assert.equal(env.CODEX_CONFIG, JSON.stringify(configured))
  const config = JSON.parse(next.CODEX_CONFIG!)
  assert.equal(config.model, configured.model)
  assert.deepEqual(config.mcp_servers, configured.mcp_servers)
  assert.equal(config.skills.max_context_tokens, 1000)
  assert.equal(config.skills.include_instructions, false)
  assert.deepEqual(config.skills.config, [
    { name: 'writing', enabled: true },
    { name: 'writing', enabled: false },
    { path: '/native/skills/writing/SKILL.md', enabled: false },
  ])
  assert.deepEqual(skillRuntimeEnvironment('claude', env, policy), env)
  assert.throws(() => skillRuntimeEnvironment('codex', { CODEX_CONFIG: '[]' }, policy), /JSON object/)
  assert.throws(() => skillRuntimeEnvironment('codex', { CODEX_CONFIG: '{' }, policy), SyntaxError)
})

test('catalog includes only current enabled paths and marks dependencies as workflow support', () => {
  const text = skillLibraryPrompt('/unused', policy)
  assert.match(text, /documentation: Write clear docs/)
  assert.match(text, /\/mew\/skills\/documentation\/SKILL.md/)
  assert.match(text, /replaces earlier Mew skill catalogs/)
  assert.match(text, /do not select those dependencies independently/)
  assert.doesNotMatch(text, /\/native\/skills|^- writing/m)
  assert.match(skillLibraryPrompt('/unused', { enabled: [], disabledNames: [], excludedPaths: [] }), /No skills are enabled/)
  assert.equal(stripMewContext(`user message\n\n${contextBlock(text)}`), 'user message')
  assert.deepEqual(skillRuntimeSessionOptions('claude'), { _meta: { claudeCode: { options: { skills: [] } } } })
  assert.deepEqual(skillRuntimeSessionOptions('codex'), {})
})

test('selected skill wrappers revalidate names and paths while preserving ordinary user text', () => {
  const skill = policy.enabled[0]
  const request = 'Use $documentation explicitly if needed.\n  Preserve whitespace.  \n</mew-selected-skills>\n\nUser request:\nThis marker is user text.'
  const wrapped = composeRuntimePrompt('codex', request, [skill])
  assert.deepEqual(selectedRuntimePrompt(wrapped), { names: ['documentation'], text: request })
  assert.equal(refreshSelectedRuntimePrompt('codex', wrapped, []), request)
  const replacement = { ...skill, path: '/project/.mew/skills/documentation/SKILL.md' }
  const refreshed = refreshSelectedRuntimePrompt('codex', wrapped, [replacement])
  assert.match(refreshed, /\/project\/\.mew\/skills\/documentation\/SKILL.md/)
  assert.doesNotMatch(refreshed, /\/mew\/skills\/documentation\/SKILL.md/)
  assert.equal(selectedRuntimePrompt(refreshed)?.text, request)
  assert.equal(composeRuntimePrompt('codex', request), request)
  for (const ordinary of [
    request,
    `Before\n${wrapped}`,
    '<mew-selected-skills version="2" names="%5B%22documentation%22%5D" length="4">\ntext\n</mew-selected-skills>\n\nUser request:\nhello',
    '<mew-selected-skills version="1" names="invalid" length="4">\ntext\n</mew-selected-skills>\n\nUser request:\nhello',
    '<mew-selected-skills version="1" names="%5B%5D" length="4">\ntext\n</mew-selected-skills>\n\nUser request:\nhello',
    '<mew-selected-skills version="1" names="%5B%22documentation%22%5D" length="999">\nMissing closing marker',
  ]) assert.equal(refreshSelectedRuntimePrompt('codex', ordinary, []), ordinary)
})

test('Claude new, clear and load requests suppress the native catalog and every turn receives the current Mew policy', { timeout: 15_000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-skill-runtime-'))
  const log = path.join(root, 'calls.jsonl')
  const stub = path.join(root, 'agent.mjs')
  const sdk = import.meta.resolve('@agentclientprotocol/sdk')
  fs.writeFileSync(stub, `
import fs from 'node:fs'
import { Readable, Writable } from 'node:stream'
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from ${JSON.stringify(sdk)}
let next = 0
const log = (method, params) => fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ method, params }) + '\\n')
new AgentSideConnection(conn => ({
  initialize: async () => ({ protocolVersion: PROTOCOL_VERSION, agentCapabilities: { loadSession: true } }),
  newSession: async params => { log('new', params); return { sessionId: 'skill-session-' + ++next } },
  loadSession: async params => { log('load', params); return {} },
  prompt: async params => { log('prompt', params); return { stopReason: 'end_turn' } },
  cancel: async () => {},
}), ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)))
`)
  let session: AgentSession | undefined
  t.after(async () => { await session?.disposeAndWait(); fs.rmSync(root, { recursive: true, force: true }) })
  skillLibrary.mutate({ cwd: root, action: 'create', scope: 'common', name: 'runtime-policy-fixture', content: '---\nname: runtime-policy-fixture\ndescription: Runtime policy test\n---\nFixture instructions.' })
  session = await AgentSession.start('claude', { cmd: process.execPath, args: [stub] }, root)
  const old = session.sessionId
  await session.runOnce('first')
  const idle = async () => {
    const deadline = Date.now() + 5000
    while (session!.busy) { assert.ok(Date.now() < deadline); await new Promise(resolve => setTimeout(resolve, 10)) }
  }
  await idle()
  let item = skillLibrary.list(root).items.find(item => item.name === 'runtime-policy-fixture')!
  skillLibrary.mutate({ cwd: root, action: 'toggle', id: item.id, revision: item.revision, scope: 'common', enabled: false })
  await session.runOnce('disabled in same session')
  await idle()
  session.clearAfterQueue()
  await idle()
  await session.runOnce('after clear')
  await idle()
  await session.loadSession(old)
  await session.runOnce('after load')
  await idle()
  item = skillLibrary.list(root).items.find(item => item.name === 'runtime-policy-fixture')!
  skillLibrary.mutate({ cwd: root, action: 'toggle', id: item.id, revision: item.revision, scope: 'common', enabled: true })
  await session.runOnce('enabled in same session')
  await idle()
  const calls = fs.readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  assert.deepEqual(calls.filter(call => ['new', 'load'].includes(call.method)).map(call => call.params._meta), [
    { claudeCode: { options: { skills: [] } } },
    { claudeCode: { options: { skills: [] } } },
    { claudeCode: { options: { skills: [] } } },
  ])
  for (const call of calls.filter(call => call.method === 'prompt')) {
    assert.equal(call.params.prompt.length, 2)
    assert.match(call.params.prompt[1].text, /Mew skills policy for this request/)
  }
  const prompts = calls.filter(call => call.method === 'prompt').map(call => call.params.prompt[1].text)
  assert.match(prompts[0], /runtime-policy-fixture: Runtime policy test/)
  for (const text of prompts.slice(1, 4)) assert.doesNotMatch(text, /runtime-policy-fixture/)
  assert.match(prompts[4], /runtime-policy-fixture: Runtime policy test/)
  assert.doesNotMatch(JSON.stringify(session.snapshot()), /Mew skills policy|<mew-context/)
})

test('Codex adapter process receives session-scoped suppression while preserving caller configuration', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-codex-skill-policy-'))
  const captured = path.join(root, 'environment.json')
  const stub = path.join(root, 'agent.mjs')
  const sdk = import.meta.resolve('@agentclientprotocol/sdk')
  fs.writeFileSync(stub, `
import fs from 'node:fs'
import { Readable, Writable } from 'node:stream'
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from ${JSON.stringify(sdk)}
fs.writeFileSync(${JSON.stringify(captured)}, process.env.CODEX_CONFIG)
new AgentSideConnection(() => ({
  initialize: async () => ({ protocolVersion: PROTOCOL_VERSION, agentCapabilities: {} }),
  newSession: async () => ({ sessionId: 'native-config-fixture' }),
  prompt: async () => ({ stopReason: 'end_turn' }),
  cancel: async () => {},
}), ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)))
`)
  let session: AgentSession | undefined
  t.after(async () => { await session?.disposeAndWait(); fs.rmSync(root, { recursive: true, force: true }) })
  const config = JSON.stringify({ model: 'fixture-model', skills: { include_instructions: true } })
  session = await AgentSession.start('codex', { cmd: process.execPath, args: [stub], env: { CODEX_CONFIG: config } }, root)
  const observed = JSON.parse(fs.readFileSync(captured, 'utf8'))
  assert.equal(observed.model, 'fixture-model')
  assert.equal(observed.skills.include_instructions, false)
  assert.ok(Array.isArray(observed.skills.config))
})

test('queued selected skills drop disabled hints and pick the current project override before execution', { timeout: 15_000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-queued-skill-policy-'))
  fs.mkdirSync(path.join(root, '.git'))
  const log = path.join(root, 'calls.jsonl'), release = path.join(root, 'release'), stub = path.join(root, 'agent.mjs')
  const sdk = import.meta.resolve('@agentclientprotocol/sdk')
  fs.writeFileSync(stub, `
import fs from 'node:fs'
import { Readable, Writable } from 'node:stream'
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from ${JSON.stringify(sdk)}
new AgentSideConnection(() => ({
  initialize: async () => ({ protocolVersion: PROTOCOL_VERSION, agentCapabilities: {} }),
  newSession: async () => ({ sessionId: 'queued-skills-fixture' }),
  prompt: async params => {
    fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(params) + '\\n')
    if (params.prompt[0].text === 'hold') while (!fs.existsSync(${JSON.stringify(release)})) await new Promise(resolve => setTimeout(resolve, 10))
    return { stopReason: 'end_turn' }
  },
  cancel: async () => {},
}), ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)))
`)
  let session: AgentSession | undefined
  t.after(async () => { fs.writeFileSync(release, ''); await session?.disposeAndWait(); fs.rmSync(root, { recursive: true, force: true }) })
  for (const name of ['queue-off-fixture', 'queue-override-fixture']) skillLibrary.mutate({ cwd: root, action: 'create', scope: 'common', name, content: `---\nname: ${name}\ndescription: Queued skill test\n---\nFixture instructions.` })
  const commonSkills = skillLibrary.list(root).items.filter(item => item.enabled)
  const disabled = commonSkills.find(skill => skill.name === 'queue-off-fixture')!
  const overridden = commonSkills.find(skill => skill.name === 'queue-override-fixture')!
  session = await AgentSession.start('claude', { cmd: process.execPath, args: [stub] }, root)
  session.prompt('hold')
  session.prompt('queued off', composeRuntimePrompt('claude', 'queued off', [disabled]))
  session.prompt('queued override', composeRuntimePrompt('claude', 'queued override', [overridden]))
  skillLibrary.mutate({ cwd: root, action: 'toggle', id: disabled.id, revision: disabled.revision, scope: 'common', enabled: false })
  skillLibrary.mutate({ cwd: root, action: 'create', scope: 'project', name: overridden.name, content: `---\nname: ${overridden.name}\ndescription: Project replacement\n---\nProject instructions.` })
  fs.writeFileSync(release, '')
  const deadline = Date.now() + 7000
  while (session.busy) { assert.ok(Date.now() < deadline); await new Promise(resolve => setTimeout(resolve, 10)) }
  const calls = fs.readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  assert.equal(calls.length, 3)
  assert.equal(calls[1].prompt[0].text, 'queued off')
  assert.match(calls[2].prompt[0].text, /Project replacement/)
  assert.ok(calls[2].prompt[0].text.includes(path.join(root, '.mew/skills/queue-override-fixture/SKILL.md')))
  assert.ok(!calls[2].prompt[0].text.includes(overridden.path))
  assert.equal(selectedRuntimePrompt(calls[2].prompt[0].text)?.text, 'queued override')
})
