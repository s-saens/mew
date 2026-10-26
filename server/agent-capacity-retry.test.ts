import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-capacity-retry-'))
process.env.MEW_WORKSPACE = root
process.env.MEW_DATA_DIR = path.join(root, 'data')
const { AgentSession } = await import('./agentAcp.ts')
const { agentGuidanceSettings, updateAgentGuidance } = await import('./agent-guidance.ts')
const { runWithAgentAccount } = await import('./agent-account-settings.ts')
const sdk = import.meta.resolve('@agentclientprotocol/sdk')
const originalSetTimeout = setTimeout
const capacity = 'Selected model is at capacity. Please try a different model.'
type AgentEvent = import('./agentAcp.ts').AgentEvent

async function until(check: () => boolean) {
  const deadline = Date.now() + 5_000
  while (!check()) {
    assert.ok(Date.now() < deadline, 'timed out waiting for capacity fixture')
    await new Promise(resolve => originalSetTimeout(resolve, 5))
  }
}

async function fixture(t: test.TestContext, behavior: string, policy: { delaySeconds: number; maxRetries: number } | null = { delaySeconds: 1, maxRetries: 2 }, holdModel: false | 'retry-before' | 'retry-after' | 'restore-before' = false) {
  const dir = fs.mkdtempSync(path.join(root, 'case-'))
  const account = `${path.basename(dir)}@capacity.test`
  const setPolicy = (value: { delaySeconds: number; maxRetries: number }) => runWithAgentAccount(account, () => {
    updateAgentGuidance({ key: 'capacityRetry', value, revision: agentGuidanceSettings().revision })
  })
  if (policy) setPolicy(policy)
  const log = path.join(dir, 'prompts.jsonl')
  const modelWaiting = path.join(dir, 'model-waiting')
  const modelRelease = path.join(dir, 'model-release')
  const stub = path.join(dir, 'adapter.mjs')
  fs.writeFileSync(stub, `
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION, RequestError } from ${JSON.stringify(sdk)};
import { Readable, Writable } from 'node:stream';
import fs from 'node:fs';
let calls=0, model='chosen', heldModel=false;
const capacity=${JSON.stringify(capacity)};
new AgentSideConnection(conn=>({
 initialize:async()=>({protocolVersion:PROTOCOL_VERSION,agentCapabilities:{},authMethods:[{id:'login',name:'Login'}]}),
 newSession:async()=>({sessionId:'same-capacity-session',models:{currentModelId:'chosen',availableModels:[{modelId:'chosen',name:'Chosen'},{modelId:'other',name:'Other'}]}}),
 unstable_setSessionModel:async({modelId})=>{
   const hold=${JSON.stringify(holdModel)};
   if(hold==='retry-after')model=modelId;
   if(!heldModel && ((hold==='restore-before' && calls===2 && modelId==='other') || (hold && hold!=='restore-before' && calls===1))){
     heldModel=true;fs.writeFileSync(${JSON.stringify(modelWaiting)},'');
     while(!fs.existsSync(${JSON.stringify(modelRelease)}))await new Promise(resolve=>setTimeout(resolve,5));
   }
   if(hold!=='retry-after')model=modelId;return {};
 },
 authenticate:async()=>{throw Error('must not authenticate')},cancel:async()=>{},
 prompt:async({sessionId,prompt})=>{
  calls++;fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({sessionId,prompt,model})+'\\n');
  const reply=async(text)=>conn.sessionUpdate({sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text}}});
  ${behavior}
  await reply('done:'+prompt[0].text);
  return {stopReason:'end_turn'};
 }
}),ndJsonStream(Writable.toWeb(process.stdout),Readable.toWeb(process.stdin)));
`)
  const budget = { source: 'fixture', total: 8 * 1024 ** 3, available: 4 * 1024 ** 3 }
  const session = await runWithAgentAccount(account, () => AgentSession.start('codex', { cmd: process.execPath, args: [stub] }, dir,
    30_000, undefined, () => [budget]))
  const events: AgentEvent[] = []
  session.attach(event => events.push(event))
  t.after(async () => { await session.disposeAndWait(); fs.rmSync(dir, { recursive: true, force: true }) })
  const meta = () => {
    const event = events.findLast(event => event.type === 'meta')
    return event?.type === 'meta' ? event.meta : assert.fail('missing session meta')
  }
  const prompts = () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean)
    .map(line => JSON.parse(line) as { sessionId: string; prompt: { type: string; text?: string; data?: string }[]; model: string }) : []
  t.mock.timers.enable({ apis: ['setTimeout'] })
  return { session, events, meta, prompts, setPolicy, budget, modelWaiting: () => fs.existsSync(modelWaiting), releaseModel: () => fs.writeFileSync(modelRelease, '') }
}

test('split streamed capacity response retries the same prompt/model/session, blocks FIFO, and restores draft settings', { timeout: 10_000 }, async t => {
  const { session, events, meta, prompts } = await fixture(t, `if(calls===1){await reply(capacity.slice(0,24));await reply(capacity.slice(24)+'\\n\\n');return {stopReason:'end_turn'}}`)
  session.prompt('original', 'original', [{ data: 'aGVsbG8=', mimeType: 'image/png' }])
  await until(() => !!meta().capacityRetry)
  session.prompt('queued')
  assert.equal(meta().busy, true)
  assert.deepEqual(meta().queued, ['queued'])
  assert.deepEqual(meta().capacityRetry && { attempt: meta().capacityRetry?.attempt, maxRetries: meta().capacityRetry?.maxRetries }, { attempt: 1, maxRetries: 2 })
  assert.equal(prompts().length, 1)
  assert.equal(events.some(event => event.type === 'turn_end' || event.type === 'error'), false)
  await session.setModel('other')
  t.mock.timers.tick(999)
  await new Promise(resolve => originalSetTimeout(resolve, 20))
  assert.equal(prompts().length, 1)
  t.mock.timers.tick(1)
  await until(() => !session.busy && prompts().length === 3)
  assert.deepEqual(prompts().map(prompt => prompt.prompt[0].text), ['original', 'original', 'queued'])
  assert.deepEqual(prompts()[1].prompt, prompts()[0].prompt, 'image and context survive a rejected initial attempt')
  assert.ok(prompts().every(prompt => prompt.sessionId === 'same-capacity-session' && prompt.model === 'chosen'))
  assert.equal(session.models?.currentModelId, 'other')
  assert.equal(meta().capacityRetry, null)
  assert.equal(events.filter(event => event.type === 'turn_start').length, 2, 'one logical turn per submitted message')
  assert.equal(events.filter(event => event.type === 'turn_end').length, 2)
})

test('capacity after partial work sends a continuation without replaying original side effects', { timeout: 10_000 }, async t => {
  const { session, meta, prompts, events } = await fixture(t, `if(calls===1){await conn.sessionUpdate({sessionId,update:{sessionUpdate:'tool_call',toolCallId:'write-once',title:'Write file',kind:'edit',status:'completed'}});await reply('Changes saved.');await reply(capacity.slice(0,24));await reply(capacity.slice(24)+'\\n\\n');return {stopReason:'end_turn'}}`)
  const result = session.runOnce('write-once request')
  await until(() => !!meta().capacityRetry)
  t.mock.timers.tick(1_000)
  assert.equal(await result, 'end_turn')
  await until(() => !session.busy)
  assert.equal(prompts().length, 2)
  assert.match(prompts()[1].prompt[0].text!, /중단된 작업을 이어서/)
  assert.doesNotMatch(prompts()[1].prompt[0].text!, /write-once request/)
  assert.equal(events.filter(event => event.type === 'turn_end').length, 1)
})

test('structured capacity errors retry, obey the turn policy snapshot, and pause FIFO after exhausting retries', { timeout: 10_000 }, async t => {
  const { session, meta, prompts, events, setPolicy } = await fixture(t, `if(calls<=3)throw new RequestError(-32000,'Internal error',{message:capacity});`)
  session.prompt('first')
  session.prompt('queued')
  await until(() => meta().capacityRetry?.attempt === 1)
  setPolicy({ delaySeconds: 30, maxRetries: 0 })
  t.mock.timers.tick(1_000)
  await until(() => meta().capacityRetry?.attempt === 2)
  t.mock.timers.tick(1_000)
  await until(() => !session.busy)
  assert.equal(prompts().length, 3, 'two retries in addition to the initial attempt')
  assert.equal(meta().capacityPaused, true)
  assert.equal(meta().capacityRetry, null)
  assert.deepEqual(meta().queued, ['queued'])
  assert.equal(events.some(event => event.type === 'auth'), false)
  assert.equal(events.filter(event => event.type === 'error').length, 1)
  session.prompt('scheduled', 'scheduled', [], [], undefined, true)
  assert.deepEqual(meta().queued, ['queued', 'scheduled'])
  session.beginQueuedEdit(0, 'queued')
  session.cancelQueuedEdit(0, 'queued')
  assert.equal(prompts().length, 3)
  session.prompt('resume')
  await until(() => !session.busy && prompts().length === 6)
  assert.deepEqual(prompts().slice(3).map(prompt => prompt.prompt[0].text), ['queued', 'scheduled', 'resume'])
  assert.equal(meta().capacityPaused, false)
})

test('default policy waits 30 seconds, offers 20 retries, and stop cancels its timer before FIFO continues', { timeout: 10_000 }, async t => {
  const { session, meta, prompts, events } = await fixture(t, `if(calls===1)throw Error(capacity);`, null)
  session.prompt('first')
  session.prompt('queued')
  await until(() => !!meta().capacityRetry)
  assert.equal(meta().capacityRetry?.maxRetries, 20)
  assert.ok(meta().capacityRetry!.retryAt - Date.now() > 29_000)
  t.mock.timers.tick(29_999)
  await new Promise(resolve => originalSetTimeout(resolve, 20))
  assert.equal(prompts().length, 1)
  session.cancel()
  await until(() => !session.busy && prompts().length === 2)
  assert.deepEqual(prompts().map(prompt => prompt.prompt[0].text), ['first', 'queued'])
  assert.equal(events.find(event => event.type === 'turn_end')?.type === 'turn_end' && (events.find(event => event.type === 'turn_end') as Extract<AgentEvent, { type: 'turn_end' }>).stopReason, 'cancelled')
  t.mock.timers.tick(60_000)
  await new Promise(resolve => originalSetTimeout(resolve, 20))
  assert.equal(prompts().length, 2)
})

test('disposing a session cancels pending retries and never sends another prompt', { timeout: 10_000 }, async t => {
  const { session, meta, prompts } = await fixture(t, `throw Error(capacity);`)
  session.prompt('first')
  await until(() => !!meta().capacityRetry)
  session.dispose()
  t.mock.timers.tick(10_000)
  await new Promise(resolve => originalSetTimeout(resolve, 30))
  assert.equal(prompts().length, 1)
})

test('stop or dispose while retry settings are in flight cannot submit another prompt', { timeout: 10_000 }, async t => {
  for (const action of ['stop', 'dispose'] as const) await t.test(action, async child => {
    const { session, meta, prompts, modelWaiting, releaseModel } = await fixture(child, `if(calls===1)throw Error(capacity);`, undefined, 'retry-before')
    session.prompt('first')
    await until(() => !!meta().capacityRetry)
    child.mock.timers.tick(1_000)
    await until(modelWaiting)
    if (action === 'stop') session.cancel()
    else session.dispose()
    releaseModel()
    if (action === 'stop') await until(() => !session.busy)
    await new Promise(resolve => originalSetTimeout(resolve, 20))
    assert.equal(prompts().length, 1)
  })
})

test('draft controls during retry settings cannot change the captured model or lose the next selection', { timeout: 10_000 }, async t => {
  const { session, meta, prompts, modelWaiting, releaseModel } = await fixture(t, `if(calls===1)throw Error(capacity);`, undefined, 'retry-after')
  session.prompt('first')
  await until(() => !!meta().capacityRetry)
  t.mock.timers.tick(1_000)
  await until(modelWaiting)
  await session.setModel('other')
  assert.equal(session.models?.currentModelId, 'other')
  await assert.rejects(session.setModel('unknown'), /지원하지 않는 모델/)
  await assert.rejects(session.setMode('unknown'), /지원하지 않는 권한/)
  await assert.rejects(session.setThinking('missing', 'unknown'), /지원하지 않는 추론/)
  assert.equal(session.models?.currentModelId, 'other')
  releaseModel()
  await until(() => !session.busy)
  assert.equal(prompts()[1].model, 'chosen')
  session.prompt('next')
  await until(() => !session.busy && prompts().length === 3)
  assert.equal(prompts()[2].model, 'other')
})

test('draft selection changed during settings restoration is applied before the next prompt', { timeout: 10_000 }, async t => {
  const { session, meta, prompts, modelWaiting, releaseModel } = await fixture(t, `if(calls===1)throw Error(capacity);`, undefined, 'restore-before')
  session.prompt('first')
  await until(() => !!meta().capacityRetry)
  await session.setModel('other')
  t.mock.timers.tick(1_000)
  await until(modelWaiting)
  await session.setModel('chosen')
  releaseModel()
  await until(() => !session.busy)
  assert.equal(session.models?.currentModelId, 'chosen')
  assert.equal(prompts()[1].model, 'chosen')
  session.prompt('next')
  await until(() => !session.busy && prompts().length === 3)
  assert.equal(prompts()[2].model, 'chosen')
})

test('memory pressure cancels a capacity wait and defers continuation until headroom recovers', { timeout: 10_000 }, async t => {
  const { session, meta, prompts, budget } = await fixture(t, `if(calls===1)throw Error(capacity);`)
  session.prompt('first')
  session.prompt('queued')
  await until(() => !!meta().capacityRetry)
  budget.available = 0
  session.checkMemory()
  await until(() => !session.busy)
  assert.equal(meta().capacityRetry, null)
  assert.equal(meta().memoryPaused, true)
  t.mock.timers.tick(60_000)
  await new Promise(resolve => originalSetTimeout(resolve, 20))
  assert.equal(prompts().length, 1)
  budget.available = 4 * 1024 ** 3
  session.checkMemory()
  await until(() => !session.busy && prompts().length === 3)
  assert.match(prompts()[1].prompt[0].text!, /메모리 부족으로 중단된 작업을 이어서/)
  assert.equal(prompts()[2].prompt[0].text, 'queued')
})

test('zero retry count pauses capacity failures immediately', { timeout: 10_000 }, async t => {
  const { session, meta, prompts } = await fixture(t, `throw Error(capacity);`, { delaySeconds: 1, maxRetries: 0 })
  session.prompt('first')
  session.prompt('queued')
  await until(() => !session.busy)
  assert.equal(prompts().length, 1)
  assert.equal(meta().capacityPaused, true)
  assert.equal(meta().capacityRetry, null)
  assert.deepEqual(meta().queued, ['queued'])
})

test('quota and real authentication failures never enter capacity retry', { timeout: 10_000 }, async t => {
  for (const message of ['Authentication required: monthly usage limit reached', 'Authentication required: insufficient credits', 'Authentication required']) {
    await t.test(message, async child => {
      const { session, meta, prompts, events } = await fixture(child, `throw new RequestError(-32000,${JSON.stringify(message)});`)
      session.prompt('first')
      session.prompt('queued')
      await until(() => !session.busy)
      assert.equal(prompts().length, 1)
      assert.equal(meta().capacityRetry, null)
      assert.equal(meta().capacityPaused, false)
      assert.deepEqual(meta().queued, ['queued'])
      assert.equal(events.some(event => event.type === 'auth'), message === 'Authentication required')
    })
  }
})

test('successful answers explaining a capacity error do not trigger retries', { timeout: 10_000 }, async t => {
  const { session, prompts, meta } = await fixture(t, `await reply('The error was: "'+capacity+'"');return {stopReason:'end_turn'};`)
  const result = session.runOnce('explain the error')
  assert.equal(await result, 'end_turn')
  await until(() => !session.busy)
  assert.equal(prompts().length, 1)
  assert.equal(meta().capacityRetry, null)
})
