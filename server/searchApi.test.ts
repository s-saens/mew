import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import { disableTestPty } from './test-disabled-pty.ts'
import { DEFAULT_PROJECT, setWorkspaceRoot, WORKSPACE_PROJECT, WORKSPACE_ROOT } from './paths.ts'
import { resetTreeWatchers } from './watcher.ts'
import { waitForSearchIndex } from './searchCatalog.ts'
import { noteFileContentChanged } from './fileCatalog.ts'
import { setFileRule } from './access-policy.ts'

disableTestPty()
const { createApiApp } = await import('./api.ts')

test('Ctrl+P와 정확 내용 검색은 전체 tree 응답 없이 통합 catalog를 사용한다', async () => {
  const original = WORKSPACE_ROOT
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mew-search-api-')))
  fs.mkdirSync(path.join(root, 'app', '.mew'), { recursive: true })
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true })
  fs.writeFileSync(path.join(root, 'app', 'SearchPanel.tsx'), 'export const uniqueNeedle = "workspace phrase"\n')
  fs.writeFileSync(path.join(root, 'app', 'public.md'), 'shared permission phrase\n')
  fs.writeFileSync(path.join(root, 'app', 'private.md'), 'shared permission phrase\n')
  fs.writeFileSync(path.join(root, 'app', 'dirty.txt'), 'previous content\n')
  fs.writeFileSync(path.join(root, 'app', 'unicode.txt'), 'a😀 😀😀 😀😀😀\nKelvin ſerver\nაბგ desiredneedle\n검색문자 사이 결과\n')
  fs.writeFileSync(path.join(root, 'app', '.env'), 'SECRET=shared permission phrase\n')
  fs.writeFileSync(path.join(root, 'docs', 'performance.md'), '# 검색 성능\n문서 고유 구절\n')
  fs.writeFileSync(path.join(root, 'scope-root.md'), 'explorer scope phrase\n')
  fs.writeFileSync(path.join(root, 'app', 'scope-child.md'), 'explorer scope phrase\n')
  fs.writeFileSync(path.join(root, 'docs', 'scope-doc.md'), 'explorer scope phrase\n')
  setWorkspaceRoot(root)

  const app = express()
  app.use(express.json())
  let role: 'owner' | 'guest' = 'owner'
  app.use((req, _res, next) => {
    ;(req as express.Request & { auth?: unknown }).auth = { role, email: role === 'guest' ? null : 'owner@example.com', mustChangePassword: false }
    next()
  })
  app.use('/api', createApiApp())
  const server = http.createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const base = typeof address === 'object' && address ? `http://127.0.0.1:${address.port}` : ''

  try {
    for (const [method, route] of [
      ['GET', '/search/semantic?q=needle'], ['GET', '/rag/status'],
      ['GET', '/rag/documents'], ['GET', '/rag/settings'],
      ['PUT', '/rag/settings'], ['POST', '/rag/reindex'],
    ]) {
      const response = await fetch(`${base}/api${route}`, { method })
      assert.equal(response.status, 404, `${method} ${route} was removed`)
    }
    const filesResponse = await fetch(`${base}/api/search/files?q=SearchPanel`)
    assert.equal(filesResponse.status, 200)
    const files = await filesResponse.json() as { results: Array<{ path: string; project: string }>; state: string }
    assert.deepEqual(files.results.map((row) => [row.project, row.path]), [[WORKSPACE_PROJECT, 'app/SearchPanel.tsx']])

    const wildcardResponse = await fetch(`${base}/api/search/files?${new URLSearchParams({ q: '*.tsx', scopes: 'subproject:app' })}`)
    assert.equal(wildcardResponse.status, 200)
    const wildcard = await wildcardResponse.json() as { results: Array<{ path: string; project: string }> }
    assert.deepEqual(wildcard.results.map(row => [row.project, row.path]), [[WORKSPACE_PROJECT, 'app/SearchPanel.tsx']])

    for (const [scopes, expected] of [
      ['root', [[WORKSPACE_PROJECT, 'app/scope-child.md'], [WORKSPACE_PROJECT, 'docs/scope-doc.md'], [WORKSPACE_PROJECT, 'scope-root.md']]],
      ['docs', [[DEFAULT_PROJECT, 'scope-doc.md']]],
      ['docs,subproject:app', [[WORKSPACE_PROJECT, 'app/scope-child.md'], [DEFAULT_PROJECT, 'scope-doc.md']]],
    ] as const) {
      const response = await fetch(`${base}/api/search/files?${new URLSearchParams({ q: 'scope-*.md', scopes })}`)
      assert.equal(response.status, 200)
      const result = await response.json() as { results: Array<{ path: string; project: string }> }
      assert.deepEqual(result.results.map(row => [row.project, row.path]), expected, scopes)
    }

    await waitForSearchIndex(WORKSPACE_PROJECT)
    await waitForSearchIndex(DEFAULT_PROJECT)
    const contentResponse = await fetch(`${base}/api/search?q=uniqueNeedle&project=${encodeURIComponent(WORKSPACE_PROJECT)}`)
    assert.equal(contentResponse.status, 200)
    const content = await contentResponse.json() as { results: Array<{ path: string }>; state: string; version: number }
    assert.deepEqual(content.results.map((row) => row.path), ['app/SearchPanel.tsx'])
    assert.equal(content.state, 'ready')
    assert.ok(content.version >= 1)

    const checkBothSearches = async (query: string, expectedPaths: string[], options: Record<string, string> = {}) => {
      const params = new URLSearchParams({ q: query, project: WORKSPACE_PROJECT, scopes: 'subproject:app', ...options })
      const response = await fetch(`${base}/api/search?${params}`)
      assert.equal(response.status, 200)
      const json = await response.json() as { results: Array<{ path: string; project: { id: string } }>; truncated: boolean; state: string; scannedDirtyFiles: number }
      assert.deepEqual(json.results.map(row => row.path), expectedPaths, query)
      const stream = await fetch(`${base}/api/search/stream?${params}`)
      const events = (await stream.text()).split('\n\n').filter(event => event.startsWith('event: '))
      const streamedResults = events.filter(event => event.startsWith('event: result\n')).map(event => JSON.parse(event.split('\n')[1].slice(6)))
      assert.deepEqual(streamedResults, json.results, `${query}: JSON/SSE parity`)
      const done = events.find(event => event.startsWith('event: done\n'))
      assert.ok(done)
      assert.equal(JSON.parse(done.split('\n')[1].slice(6)).truncated, json.truncated)
      return json
    }

    const rootContent = await checkBothSearches('explorer scope phrase', ['app/scope-child.md', 'docs/scope-doc.md', 'scope-root.md'], { scopes: 'root' })
    assert.ok(rootContent.results.every(row => row.project.id === WORKSPACE_PROJECT))
    const docsContent = await checkBothSearches('explorer scope phrase', ['scope-doc.md'], { scopes: 'docs' })
    assert.ok(docsContent.results.every(row => row.project.id === DEFAULT_PROJECT))
    const mixedContent = await checkBothSearches('explorer scope phrase', ['app/scope-child.md', 'scope-doc.md'], { scopes: 'docs,subproject:app' })
    assert.deepEqual(mixedContent.results.map(row => row.project.id), [WORKSPACE_PROJECT, DEFAULT_PROJECT])
    await checkBothSearches('explorer scope phrase', ['app/scope-child.md', 'docs/scope-doc.md', 'scope-root.md', 'scope-doc.md'], { scopes: '' })

    for (const query of ['a😀', '😀😀', '😀😀😀', 'ᲐᲑᲒ', 'ᲐᲑᲒ*needle', 'kelvin', 'server', '검색문자*결과']) {
      await checkBothSearches(query, ['app/unicode.txt'])
    }
    await checkBothSearches('ᲐᲑᲒ', [], { case: '1' })
    await checkBothSearches('unique.*workspace phrase', ['app/SearchPanel.tsx'], { regex: '1' })

    fs.writeFileSync(path.join(root, 'app', 'dirty.txt'), 'dirty wildcard result\n')
    noteFileContentChanged(WORKSPACE_PROJECT, 'app/dirty.txt')
    await checkBothSearches('dirty*result', ['app/dirty.txt'])
    await waitForSearchIndex(WORKSPACE_PROJECT)
    await checkBothSearches('dirty*result', ['app/dirty.txt'])

    const previousIndexFlag = process.env.MEW_SEARCH_INDEX_ENABLED
    try {
      process.env.MEW_SEARCH_INDEX_ENABLED = '0'
      assert.equal((await checkBothSearches('unique*workspace phrase', ['app/SearchPanel.tsx'])).state, 'disabled')
    } finally {
      if (previousIndexFlag === undefined) delete process.env.MEW_SEARCH_INDEX_ENABLED
      else process.env.MEW_SEARCH_INDEX_ENABLED = previousIndexFlag
    }

    for (const route of ['/search', '/search/stream']) {
      const response = await fetch(`${base}/api${route}?${new URLSearchParams({ q: 'unique*workspace phrase', project: WORKSPACE_PROJECT, scopes: 'subproject:app' })}`)
      assert.equal(response.status, 200)
      if (route.endsWith('/stream')) {
        const stream = await response.text()
        assert.match(stream, /event: result/)
        assert.match(stream, /app\/SearchPanel.tsx/)
        assert.match(stream, /event: done/)
      } else {
        const result = await response.json() as { results: Array<{ path: string }> }
        assert.deepEqual(result.results.map(row => row.path), ['app/SearchPanel.tsx'])
      }
    }
    const regexFiles = await fetch(`${base}/api/search/files?${new URLSearchParams({ q: '^SearchPanel\\.tsx$', regex: '1', scopes: 'subproject:app' })}`)
    assert.equal(regexFiles.status, 200)
    const regexResult = await regexFiles.json() as { results: Array<{ path: string }> }
    assert.deepEqual(regexResult.results.map(row => row.path), ['app/SearchPanel.tsx'])
    const invalidRegex = await fetch(`${base}/api/search/files?${new URLSearchParams({ q: '(', regex: '1' })}`)
    assert.equal(invalidRegex.status, 400)

    for (const query of ['needle(?=Value)', '(needle)\\1']) {
      for (const route of ['/search/files', '/search']) {
        const rejected = await fetch(`${base}/api${route}?${new URLSearchParams({ q: query, regex: '1', project: WORKSPACE_PROJECT })}`)
        assert.equal(rejected.status, 400, `${route}: ${query}`)
      }
      const stream = await fetch(`${base}/api/search/stream?${new URLSearchParams({ q: query, regex: '1', project: WORKSPACE_PROJECT })}`)
      assert.match(await stream.text(), /event: error/)
      const replaced = await fetch(`${base}/api/search/replace?project=${encodeURIComponent(WORKSPACE_PROJECT)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'app/SearchPanel.tsx', query, replace: 'changed', regex: true }),
      })
      assert.equal(replaced.status, 400)
      assert.equal(fs.readFileSync(path.join(root, 'app', 'SearchPanel.tsx'), 'utf8'), 'export const uniqueNeedle = "workspace phrase"\n')
    }

    setFileRule('guest', WORKSPACE_PROJECT, 'app/public.md', 'view')
    setFileRule('guest', WORKSPACE_PROJECT, 'app/private.md', 'inherit')
    role = 'guest'
    const guestResponse = await fetch(`${base}/api/search?q=${encodeURIComponent('shared permission')}&project=${encodeURIComponent(WORKSPACE_PROJECT)}`)
    assert.equal(guestResponse.status, 200)
    const guest = await guestResponse.json() as { results: Array<{ path: string }> }
    assert.deepEqual(guest.results.map((row) => row.path), ['app/public.md'])
    await checkBothSearches('shared permission', ['app/public.md'], { scopes: 'root' })

    const longQuery = await fetch(`${base}/api/search?q=${'x'.repeat(2_001)}&project=${encodeURIComponent(WORKSPACE_PROJECT)}`)
    assert.equal(longQuery.status, 400)
  } finally {
    setFileRule('guest', WORKSPACE_PROJECT, 'app/public.md', 'inherit')
    await new Promise<void>((resolve) => server.close(() => resolve()))
    resetTreeWatchers()
    setWorkspaceRoot(original)
    fs.rmSync(root, { recursive: true, force: true })
  }
})
