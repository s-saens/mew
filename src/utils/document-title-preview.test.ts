import test from 'node:test'
import assert from 'node:assert/strict'
import { clearTitlePreviews, documentAbsolutePath, previewDatabaseDocumentTitle, previewDocumentTitle, remapTitlePreviews, subscribeTitlePreviews, titlePreviews, withDocumentTitle } from './document-title-preview.ts'

test('confirmed titles preserve newer typing and cleanup stays within the workspace', () => {
  previewDocumentTitle('/one/task.md', 'Newer', 'editor')
  previewDocumentTitle('/one-more/task.md', 'Other workspace', 'task')
  try {
    clearTitlePreviews('/one/task.md', 'Older')
    assert.equal(titlePreviews()['/one/task.md'].title, 'Newer')
    clearTitlePreviews('/one')
    assert.equal(titlePreviews()['/one/task.md'], undefined)
    assert.equal(titlePreviews()['/one-more/task.md'].title, 'Other workspace')
  } finally { clearTitlePreviews('/one'); clearTitlePreviews('/one-more') }
})

test('simultaneous path swaps keep each document title associated with its document', () => {
  previewDocumentTitle('/swap/A.md', 'B', 'editor')
  previewDocumentTitle('/swap/B.md', 'A', 'task')
  try {
    remapTitlePreviews([{ from: '/swap/A.md', to: '/swap/B.md' }, { from: '/swap/B.md', to: '/swap/A.md' }])
    assert.deepEqual(titlePreviews()['/swap/A.md'], { title: 'A', source: 'task' })
    assert.deepEqual(titlePreviews()['/swap/B.md'], { title: 'B', source: 'editor' })
    clearTitlePreviews('/swap/A.md', 'A')
    assert.equal(titlePreviews()['/swap/A.md'], undefined)
    remapTitlePreviews([{ from: '/swap', to: '/renamed', directory: true }])
    assert.equal(titlePreviews()['/swap/B.md'], undefined)
    assert.equal(titlePreviews()['/renamed/B.md'].title, 'B')
    clearTitlePreviews('/renamed')
    previewDocumentTitle('/renamed/B.md', 'Unrelated new file', 'editor')
    assert.equal(titlePreviews()['/renamed/B.md'].title, 'Unrelated new file')
  } finally { clearTitlePreviews('/swap'); clearTitlePreviews('/renamed') }
})

test('task title previews preserve body, YAML comments, custom descriptions and CRLF', () => {
  const source = '---\r\ntitle: Old # keep\r\ndescription: "태스크: Old"\r\ndone: false\r\n---\r\n\r\nBody untouched\r\n'
  const changed = withDocumentTitle(source, 'New')
  assert.match(changed, /title: New # keep\r\n/)
  assert.match(changed, /description: "태스크: New"\r\n/)
  assert.ok(changed.endsWith('---\r\n\r\nBody untouched\r\n'))
  assert.equal(changed.replace(/\r\n/g, '').includes('\n'), false)
  assert.match(withDocumentTitle(source.replace('태스크: Old', 'Custom description'), 'New'), /description: "Custom description"/)
  assert.equal(withDocumentTitle('No frontmatter\n', 'New'), 'No frontmatter\n')
  const invalid = '---\ntitle: [invalid\n---\nBody'
  assert.equal(withDocumentTitle(invalid, 'New'), invalid)
})

test('document scopes map to the same absolute path with a custom Documents root', () => {
  assert.equal(documentAbsolutePath('/workspace', '/workspace/notes', 'docs', 'task.md'), '/workspace/notes/task.md')
  assert.equal(documentAbsolutePath('/workspace', undefined, '.workspace', 'docs/task.md'), '/workspace/docs/task.md')
  assert.equal(documentAbsolutePath('/workspace', undefined, 'project', 'task.md'), '/workspace/project/task.md')
})

test('database preview completion follows confirmed moves and preserves newer typing', () => {
  const settleOlder = previewDatabaseDocumentTitle('/database/Old.md', 'First')
  const settleNewer = previewDatabaseDocumentTitle('/database/Old.md', 'Still typing')
  try {
    remapTitlePreviews([{ from: '/database/Old.md', to: '/database/First.md' }])
    settleOlder('First')
    assert.deepEqual(titlePreviews()['/database/First.md'], { title: 'Still typing', source: 'database' })
    const settleLatest = previewDatabaseDocumentTitle('/database/Old.md', 'Typed while tabs refresh')
    assert.equal(titlePreviews()['/database/Old.md'], undefined, 'a cell using the old operational path follows its moved preview')
    assert.equal(titlePreviews()['/database/First.md'].title, 'Typed while tabs refresh')
    settleNewer('Still typing')
    assert.equal(titlePreviews()['/database/First.md'].title, 'Typed while tabs refresh')
    settleLatest('Typed while tabs refresh')
    assert.equal(titlePreviews()['/database/First.md'], undefined)
  } finally { clearTitlePreviews('/database') }
})

test('a failed database title restores the confirmed title before removing its own preview', () => {
  const observed: string[] = []
  const settle = previewDatabaseDocumentTitle('/database/Old.md', 'Duplicate')
  const unsubscribe = subscribeTitlePreviews(() => { observed.push(titlePreviews()['/database/Old.md']?.title ?? 'cleared') })
  try {
    settle('Old')
    settle('Unexpected second completion')
    assert.deepEqual(observed, ['Old', 'cleared'])
    const stale = previewDatabaseDocumentTitle('/database/Old.md', 'Database input')
    previewDocumentTitle('/database/Old.md', 'Editor input', 'editor')
    stale('Old')
    assert.equal(titlePreviews()['/database/Old.md'].title, 'Editor input')
  } finally { unsubscribe(); clearTitlePreviews('/database') }
})
