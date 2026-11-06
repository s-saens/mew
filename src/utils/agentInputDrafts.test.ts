import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { agentInputOwnerKey, clearAgentInputDraft, readAgentInputDraft, readAgentInputHistory, recordAgentInputHistory, writeAgentInputDraft } from './agentInputDrafts.ts'

class MemoryStorage {
  private store = new Map<string, string>()
  getItem(k: string): string | null {
    return this.store.has(k) ? this.store.get(k)! : null
  }
  setItem(k: string, v: string): void {
    this.store.set(k, v)
  }
  removeItem(k: string): void {
    this.store.delete(k)
  }
  has(k: string): boolean {
    return this.store.has(k)
  }
}

const DRAFTS_KEY = 'mew:agent-input-drafts'
let mem: MemoryStorage

beforeEach(() => {
  mem = new MemoryStorage()
  ;(globalThis as { localStorage?: unknown }).localStorage = mem
})

test('에이전트 탭별로 입력 초안을 저장하고 읽는다', () => {
  writeAgentInputDraft('tab-a', '첫 탭 질문')
  writeAgentInputDraft('tab-b', '둘째 탭 질문')

  assert.equal(readAgentInputDraft('tab-a'), '첫 탭 질문')
  assert.equal(readAgentInputDraft('tab-b'), '둘째 탭 질문')
  assert.equal(readAgentInputDraft('missing'), '')
})

test('빈 문자열을 쓰면 초안이 지워지고 마지막 초안이면 저장 키도 제거된다', () => {
  writeAgentInputDraft('tab-a', 'draft')
  assert.ok(mem.has(DRAFTS_KEY))

  writeAgentInputDraft('tab-a', '')

  assert.equal(readAgentInputDraft('tab-a'), '')
  assert.equal(mem.has(DRAFTS_KEY), false)
})

test('clearAgentInputDraft는 해당 탭만 지운다', () => {
  writeAgentInputDraft('tab-a', 'aaa')
  writeAgentInputDraft('tab-b', 'bbb')

  clearAgentInputDraft('tab-a')

  assert.equal(readAgentInputDraft('tab-a'), '')
  assert.equal(readAgentInputDraft('tab-b'), 'bbb')
})

test('에이전트 탭별 입력 히스토리는 연속 중복 없이 남는다', () => {
  recordAgentInputHistory('tab-a', '첫 질문')
  recordAgentInputHistory('tab-a', '둘째 질문')
  recordAgentInputHistory('tab-a', '둘째 질문')
  recordAgentInputHistory('tab-b', '다른 탭 질문')

  assert.deepEqual(readAgentInputHistory('tab-a'), ['첫 질문', '둘째 질문'])
  assert.deepEqual(readAgentInputHistory('tab-b'), ['다른 탭 질문'])
  clearAgentInputDraft('tab-a')
  assert.deepEqual(readAgentInputHistory('tab-a'), [])
})

test('저장값이 손상되면 빈 문자열로 폴백한다', () => {
  mem.setItem(DRAFTS_KEY, '{broken')

  assert.equal(readAgentInputDraft('tab-a'), '')
})

test('identical tab IDs isolate drafts and history by account, logical project and working root', () => {
  const scope = { account: 'owner', projectPath: '/project', workspacePath: '/project' }
  const owners = [scope,
    { ...scope, account: 'member' },
    { ...scope, projectPath: '/another-project' },
    { ...scope, workspacePath: '/project-worktree' }]
  for (const [index, owner] of owners.entries()) {
    writeAgentInputDraft('same-tab', `draft ${index}`, owner)
    recordAgentInputHistory('same-tab', `sent ${index}`, owner)
  }
  for (const [index, owner] of owners.entries()) {
    assert.equal(readAgentInputDraft('same-tab', owner), `draft ${index}`)
    assert.deepEqual(readAgentInputHistory('same-tab', owner), [`sent ${index}`])
  }
  clearAgentInputDraft('same-tab', owners[0])
  assert.equal(readAgentInputDraft('same-tab', owners[0]), '')
  assert.deepEqual(readAgentInputHistory('same-tab', owners[0]), [])
  assert.equal(readAgentInputDraft('same-tab', owners[3]), 'draft 3')
  assert.deepEqual(readAgentInputHistory('same-tab', owners[3]), ['sent 3'])
})

test('explicit views never claim ambiguous legacy drafts; the compatibility view migrates once', () => {
  writeAgentInputDraft('tab', 'legacy draft')
  recordAgentInputHistory('tab', 'legacy sent')
  const explicit = { account: 'owner', projectPath: '/a', workspacePath: '/a' }
  assert.equal(readAgentInputDraft('tab', explicit), '')
  assert.deepEqual(readAgentInputHistory('tab', explicit), [])
  assert.equal(readAgentInputDraft('tab'), 'legacy draft')
  assert.deepEqual(readAgentInputHistory('tab'), ['legacy sent'])
  const compatibility = { ...explicit, migrateLegacy: true }
  assert.equal(readAgentInputDraft('tab', compatibility), 'legacy draft')
  assert.deepEqual(readAgentInputHistory('tab', compatibility), ['legacy sent'])
  assert.equal(readAgentInputDraft('tab'), '')
  assert.deepEqual(readAgentInputHistory('tab'), [])
  assert.equal(readAgentInputDraft('tab', { ...compatibility, workspacePath: '/b' }), '')
  assert.deepEqual(readAgentInputHistory('tab', { ...compatibility, workspacePath: '/b' }), [])
  const entries = JSON.parse(mem.getItem(DRAFTS_KEY)!) as Record<string, string>
  assert.deepEqual(Object.keys(entries), [agentInputOwnerKey('tab', explicit)])
})

test('compatibility writes and close discard obsolete legacy entries without affecting other owners', () => {
  const scope = { account: 'owner', projectPath: '/a', workspacePath: '/a', migrateLegacy: true }
  const other = { ...scope, workspacePath: '/b', migrateLegacy: false }
  writeAgentInputDraft('tab', 'legacy draft')
  writeAgentInputDraft('tab', 'other draft', other)
  writeAgentInputDraft('tab', 'new draft', scope)
  assert.equal(readAgentInputDraft('tab'), '')
  assert.equal(readAgentInputDraft('tab', scope), 'new draft')
  recordAgentInputHistory('tab', 'legacy history')
  recordAgentInputHistory('tab', 'other history', other)
  clearAgentInputDraft('tab', scope)
  assert.equal(readAgentInputDraft('tab', scope), '')
  assert.deepEqual(readAgentInputHistory('tab', scope), [])
  assert.equal(readAgentInputDraft('tab', other), 'other draft')
  assert.deepEqual(readAgentInputHistory('tab', other), ['other history'])
})

test('failed migration writes leave the legacy disk value available for a later compatibility retry', () => {
  writeAgentInputDraft('tab', 'recoverable')
  const previous = mem.setItem.bind(mem)
  mem.setItem = () => { throw new Error('quota') }
  const scope = { account: 'owner', projectPath: '/a', workspacePath: '/a', migrateLegacy: true }
  assert.equal(readAgentInputDraft('tab', scope), 'recoverable')
  assert.equal(readAgentInputDraft('tab'), 'recoverable')
  mem.setItem = previous
  assert.equal(readAgentInputDraft('tab', scope), 'recoverable')
  assert.equal(readAgentInputDraft('tab'), '')
})
