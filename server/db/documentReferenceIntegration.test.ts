import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createDocumentReferenceIntegration } from './documentReferenceIntegration.ts'

const marker = '<div data-mew-db="11111111-1111-4111-8111-111111111111"></div>'
type Saved = { path: string; content: string | null; previous?: string }
function fixture(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-db-reference-events-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const batches: Saved[][] = [], events: string[] = []
  const registered = new Set<string>()
  const adapter = {
    configured: () => true,
    resolve: (_project: string, relative: string) => path.join(root, relative),
    registeredPaths: async (_project: string, prefixes: readonly string[]) => [...registered].filter(relative => prefixes.some(prefix => relative === prefix || relative.startsWith(`${prefix}/`))),
    sync: async (_project: string, documents: Saved[]) => { batches.push(documents); events.push('sync') },
    remap: async () => { events.push('remap') },
  }
  const write = (relative: string, content: string) => { const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content) }
  return { root, adapter, batches, events, registered, write }
}

test('successful saves submit exact content and previous markers, including the last marker removal', async t => {
  const f = fixture(t), integration = createDocumentReferenceIntegration(f.adapter)
  await integration.save('p', 'page.md', `intro\n${marker}`, marker)
  await integration.save('p', 'page.md', 'plain text', marker)
  assert.deepEqual(f.batches, [
    [{ path: 'page.md', content: `intro\n${marker}`, previous: marker }],
    [{ path: 'page.md', content: 'plain text', previous: marker }],
  ])
})

test('ordinary text and non-Markdown saves avoid optional database access', async t => {
  const f = fixture(t)
  f.adapter.sync = async () => { assert.fail('ordinary save must not query Postgres') }
  const integration = createDocumentReferenceIntegration(f.adapter)
  await integration.save('p', 'page.md', 'ordinary', 'previous')
  await integration.save('p', 'source.ts', marker, marker)
  f.adapter.configured = () => false
  await integration.save('p', 'page.md', marker)
  await integration.refresh('p', ['page.md'])
})

test('watcher batches changed destinations with registered deleted files and folders', async t => {
  const f = fixture(t), integration = createDocumentReferenceIntegration(f.adapter)
  f.registered.add('old/nested/page.md')
  f.registered.add('untouched.md')
  f.write('new/nested/page.md', `\n${marker}`)
  f.write('unrelated.md', marker)
  await integration.refresh('p', ['old', 'new'])
  assert.deepEqual(f.batches, [[
    { path: 'new/nested/page.md', content: `\n${marker}` },
    { path: 'old/nested/page.md', content: null },
  ]])
})

test('watcher removes a registered reference when the changed file has no markers', async t => {
  const f = fixture(t), integration = createDocumentReferenceIntegration(f.adapter)
  f.registered.add('page.md')
  f.write('page.md', 'removed block')
  await integration.refresh('p', ['page.md'])
  assert.deepEqual(f.batches, [[{ path: 'page.md', content: 'removed block' }]])
})

test('deleting a legacy document preserves previous markers despite missing reference metadata', async t => {
  const f = fixture(t), integration = createDocumentReferenceIntegration(f.adapter)
  f.write('pages/a.md', marker)
  await integration.mutate('p', ['pages'], () => {
    fs.rmSync(path.join(f.root, 'pages'), { recursive: true })
    return { path: 'pages', moves: [], changed: ['pages'] }
  })
  assert.deepEqual(f.batches, [[{ path: 'pages/a.md', content: null, previous: marker }]])
})

test('structural moves remap metadata before a queued watcher can remove their old paths', async t => {
  const f = fixture(t)
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  f.adapter.remap = async () => { f.events.push('remap'); await held }
  f.registered.add('old.md')
  f.write('old.md', marker)
  const integration = createDocumentReferenceIntegration(f.adapter)
  const mutation = integration.mutate('p', ['old.md'], () => {
    fs.renameSync(path.join(f.root, 'old.md'), path.join(f.root, 'new.md'))
    return { path: 'new.md', moves: [{ from: 'old.md', to: 'new.md' }], changed: ['old.md', 'new.md'] }
  })
  const watcher = integration.refresh('p', ['old.md'])
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(f.events, ['remap'])
  release()
  await Promise.all([mutation, watcher])
  assert.deepEqual(f.events, ['remap', 'sync', 'sync'])
  assert.deepEqual(f.batches[0], [
    { path: 'new.md', content: marker },
    { path: 'old.md', content: null, previous: marker },
  ])
})

test('optional database errors retain successful disk edits and leave the queue usable', async t => {
  const f = fixture(t)
  t.mock.method(console, 'error', () => {})
  f.adapter.sync = async () => { throw new Error('optional database offline') }
  const integration = createDocumentReferenceIntegration(f.adapter)
  const result = await integration.mutate('p', [], () => {
    f.write('copied.md', marker)
    return { path: 'copied.md', moves: [], changed: ['copied.md'] }
  })
  assert.equal(result.path, 'copied.md')
  assert.equal(fs.readFileSync(path.join(f.root, 'copied.md'), 'utf8'), marker)
  f.adapter.sync = async (_project, documents) => { f.batches.push(documents) }
  await integration.save('p', 'copied.md', marker)
  assert.equal(f.batches.length, 1)
})

test('failed structural operations retain their errors and never modify reference metadata', async t => {
  const f = fixture(t), integration = createDocumentReferenceIntegration(f.adapter)
  await assert.rejects(integration.mutate('p', [], () => { throw new Error('destination exists') }), /destination exists/)
  assert.deepEqual(f.events, [])
  await integration.save('p', 'page.md', marker)
  assert.equal(f.batches.length, 1)
})

test('reference keys normalize relative aliases and match mixed-case database markers', async t => {
  const f = fixture(t), integration = createDocumentReferenceIntegration(f.adapter)
  const uppercase = marker.replace('data-mew-db', 'DATA-MEW-DB')
  await integration.save('p', './pages/../page.md', uppercase)
  f.write('page.md', uppercase)
  await integration.refresh('p', ['./page.md'])
  assert.deepEqual(f.batches, [
    [{ path: 'page.md', content: uppercase }],
    [{ path: 'page.md', content: uppercase }],
  ])
})

test('changed-folder inspection skips denied directories, nested worktrees and symlinks', async t => {
  const f = fixture(t), integration = createDocumentReferenceIntegration(f.adapter)
  f.write('pages/allowed.md', marker)
  for (const excluded of ['node_modules', '.git', '.data', '.worktrees']) f.write(`pages/${excluded}/hidden.md`, marker)
  f.write('unrelated.md', marker)
  fs.symlinkSync(path.join(f.root, 'unrelated.md'), path.join(f.root, 'pages/link.md'))
  await integration.refresh('p', ['pages', 'node_modules'])
  assert.deepEqual(f.batches, [[{ path: 'pages/allowed.md', content: marker }]])
})
