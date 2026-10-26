import test from 'node:test'
import assert from 'node:assert/strict'
import { parse, stringify } from 'yaml'
import { mergeTaskFrontmatter, TaskFrontmatterConflict } from './task-frontmatter-merge.ts'
const document = (tags: string, assignees = '[alice@example.test]', body = 'Body') => `---\ntitle: Task\ndone: false\ntags: ${tags}\nassignees: ${assignees}\ncustom: retained # comment\n---\n${body}`
const fields = (content: string) => parse(content.split('---')[1])

test('body-only saves retain tags added, changed or removed in another panel', () => {
  for (const [before, after] of [['[]', '[기능]'], ['[old]', '[new]'], ['[old]', '[]']]) {
    const base = document(before), current = document(after)
    const merged = mergeTaskFrontmatter(base, document(before, undefined, 'Edited body'), current)
    assert.deepEqual(fields(merged).tags, fields(current).tags)
    assert.ok(merged.endsWith('Edited body'))
    assert.ok(merged.includes('custom: retained # comment'))
  }
})
test('explicit removal, unrelated collection changes and conflicting edits remain distinct', () => {
  const base = document('[old]')
  const merged = mergeTaskFrontmatter(base, document('[]'), document('[old]', '[bob@example.test]'))
  assert.deepEqual(fields(merged).tags, [])
  assert.deepEqual(fields(merged).assignees, ['bob@example.test'])
  assert.throws(() => mergeTaskFrontmatter(base, document('[local]'), document('[remote]')), TaskFrontmatterConflict)
  assert.equal(mergeTaskFrontmatter(base, document('[same]'), document('[same]')), document('[same]'))
})
test('server response rebases pending body edits and collection representations compare semantically', () => {
  const base = document('[]'), submitted = document('[]', undefined, 'First body')
  const saved = mergeTaskFrontmatter(base, submitted, document('[remote]'))
  const pending = mergeTaskFrontmatter(submitted, document('[]', undefined, 'Pending body'), saved, false)
  assert.deepEqual(fields(pending).tags, ['remote'])
  assert.ok(pending.endsWith('Pending body'))
  const quoted = document('"[old]"', undefined, 'Edited')
  assert.deepEqual(fields(mergeTaskFrontmatter(document('[old]'), quoted, document('[new]'))).tags, ['new'])
})

test('body-only saves preserve externally changed titles, descriptions, completion and dates', () => {
  const base = document('[old]').replace('done: false', 'description: "태스크: Task"\ndone: false\nstartDate: 2026-10-01\ndate: 2026-10-02')
  const current = base.replace('title: Task', 'title: Renamed').replace('태스크: Task', '태스크: Renamed').replace('done: false', 'done: true').replace('2026-10-01', '2026-10-03').replace('2026-10-02', '2026-10-04')
  const submitted = base + ' edited'
  const saved = mergeTaskFrontmatter(base, submitted, current)
  assert.deepEqual(fields(saved), fields(current))
  assert.ok(saved.endsWith('Body edited'))
  assert.ok(saved.includes('custom: retained # comment'))
  const pending = mergeTaskFrontmatter(submitted, submitted + ' pending', saved, false)
  assert.deepEqual(fields(pending), fields(current))
  assert.ok(pending.endsWith('Body edited pending'))
})

test('scalar field edits merge independently, preserve removals and reject competing changes', () => {
  const documentWith = (value: Record<string, unknown>, body = 'Body') => `---\n${stringify(value)}---\n${body}`
  const original = { title: 'Task', description: 'Original', done: false, startDate: '2026-10-01', date: '2026-10-04' }
  const base = documentWith(original)
  const current = documentWith({ ...original, done: true, startDate: '2026-10-02' })
  const local = documentWith({ ...original, title: 'Local', date: undefined }, 'Edited body')
  const merged = mergeTaskFrontmatter(base, local, current)
  assert.deepEqual(fields(merged), { title: 'Local', description: 'Original', done: true, startDate: '2026-10-02' })
  assert.ok(merged.endsWith('Edited body'))
  const removed = mergeTaskFrontmatter(base, base + ' edited', documentWith({ ...original, startDate: undefined, date: undefined }))
  assert.equal(fields(removed).startDate, undefined)
  assert.equal(fields(removed).date, undefined)
  for (const [key, before, incoming, remote] of [
    ['title', 'Task', 'Local', 'Remote'], ['description', 'Original', 'Local', 'Remote'], ['done', undefined, true, false],
    ['startDate', '2026-10-01', '2026-10-02', '2026-10-03'], ['date', '2026-10-04', '2026-10-05', '2026-10-06'],
  ] as const) {
    const initial = documentWith({ ...original, [key]: before }), submitted = documentWith({ ...original, [key]: incoming }), disk = documentWith({ ...original, [key]: remote })
    assert.throws(() => mergeTaskFrontmatter(initial, submitted, disk), TaskFrontmatterConflict, key)
    assert.equal(fields(mergeTaskFrontmatter(initial, submitted, disk, false))[key], incoming, key)
  }
  const quotedCompletion = base.replace('done: false', 'done: "false"')
  assert.equal(fields(mergeTaskFrontmatter(base, quotedCompletion + ' edited', current)).done, true)
})
