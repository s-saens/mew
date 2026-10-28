import test from 'node:test'
import assert from 'node:assert/strict'
import { historySearchSnippet, historySearchTerms, historySessionIdScore, mergeSessionSearchResults, normalizeHistorySearch, scoreHistorySearch } from '../shared/agent-session-search.ts'

test('conversation topics match spacing, case and bilingual concept names', () => {
  assert.equal(normalizeHistorySearch('에이전트 패널 · ＡＢＣ'), '에이전트패널abc')
  assert.ok(scoreHistorySearch('에이전트 패널의 입력을 수정했다', '에이전트패널') > 0)
  assert.ok(scoreHistorySearch('Improve the agent panel layout', '에이전트패널') > 0)
  assert.ok(scoreHistorySearch('에이전트 창의 입력 높이를 조절', 'agent panel') > 0)
  assert.equal(scoreHistorySearch('파일 편집', '에이전트패널'), 0)
  assert.equal(scoreHistorySearch('agent panel', '에이전트패널 오류'), 0)
  assert.ok(scoreHistorySearch('Fix an error in the agent panel', '에이전트패널 error') > 0)
  assert.deepEqual(historySearchTerms('   '), [])
  assert.deepEqual(historySearchTerms('" * : !'), [])
})

test('session ID matches rank ahead of topic matches, merge sources, and preserve the latest timestamp', () => {
  const results = mergeSessionSearchResults([
    { sessionId: 'topic', title: 'abc', score: 100, updatedAt: '2026-10-28' },
    { sessionId: 'abc-tail', title: 'Other', updatedAt: '2026-10-27' },
    { sessionId: 'abc', title: 'Exact', updatedAt: '2026-10-26' },
    { sessionId: 'abc', title: null, snippet: 'Content match', score: 90, updatedAt: '2026-10-28' },
    { sessionId: 'unrelated', title: 'Nothing' },
  ], 'abc')
  assert.deepEqual(results.map(result => result.sessionId), ['abc', 'abc-tail', 'topic'])
  assert.equal(results[0].title, 'Exact')
  assert.equal(results[0].snippet, 'Content match')
  assert.equal(results[0].updatedAt, '2026-10-28')
  assert.ok(historySessionIdScore('ABC-123', 'abc-123') > historySessionIdScore('ABC-123', '123'))
  assert.equal(mergeSessionSearchResults(results, '', 2).length, 2)
})

test('snippets show the matching passage in long original messages', () => {
  const snippet = historySearchSnippet(`${'앞부분 '.repeat(100)}에이전트 패널을 고쳤다. ${'뒷부분 '.repeat(100)}`, '에이전트패널')
  assert.ok(snippet.includes('에이전트 패널'))
  assert.ok(snippet.startsWith('…') && snippet.endsWith('…'))
  assert.ok(snippet.length <= 182)
})
