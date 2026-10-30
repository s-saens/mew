import assert from 'node:assert/strict'
import test from 'node:test'
import { PublicShareDocument } from './public-share-document.ts'

const file = { name: 'README.md', path: '', content: 'initial', version: { size: 7, mtimeMs: 1, ctimeMs: 1, tag: 'v1' } }

test('public saves serialize revisions and retain edits made during a pending save', async () => {
  let release: (() => void) | undefined
  const writes: { content: string; tag: string | undefined }[] = []
  const document = new PublicShareDocument(file, async (content, version) => {
    writes.push({ content, tag: version.tag })
    if (writes.length === 1) await new Promise<void>(resolve => { release = resolve })
    return { ...file, content, version: { ...file.version, tag: `v${writes.length + 1}` } }
  })
  document.change('first')
  const saving = document.save()
  assert.equal(document.state.saving, true)
  document.change('second')
  assert.equal(document.save(), saving)
  release!()
  assert.equal(await saving, true)
  assert.deepEqual(writes, [{ content: 'first', tag: 'v1' }, { content: 'second', tag: 'v2' }])
  assert.equal(document.state.draft, 'second')
  assert.equal(document.dirty, false)
  assert.equal(document.state.saving, false)
})

test('conflicting or revoked public saves preserve the draft and original revision', async () => {
  const error = new Error('conflict')
  let fail = true
  const document = new PublicShareDocument(file, async content => {
    if (fail) throw error
    return { ...file, content, version: { ...file.version, tag: 'v2' } }
  })
  document.change('keep this draft')
  assert.equal(await document.save(), false)
  assert.equal(document.state.draft, 'keep this draft')
  assert.equal(document.state.file.version.tag, 'v1')
  assert.equal(document.state.error, error)
  assert.equal(document.dirty, true)
  fail = false
  assert.equal(await document.save(), true)
  assert.equal(document.dirty, false)
  assert.equal(document.state.error, null)
})
