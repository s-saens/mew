import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathsForWorkspace, setDocsDir, workspaceContext, WORKSPACE_PROJECT } from './paths.ts'
import { addComment, addThread, deleteComment, editComment, listThreads } from './comments.ts'
import { readTableLayout, writeTableLayout } from './tableLayout.ts'
import { readFrontmatterOptionColors, readFrontmatterOptions, updateFrontmatterOptions } from './frontmatter-options.ts'

const anchor = { text: 'text', prefix: '', line: 1 }
const author = { email: 'author@example.test', isOwner: false }

function fixture(fn: (root: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-document-metadata-'))
  try {
    workspaceContext.run(pathsForWorkspace(root, null), () => {
      setDocsDir('.mew/docs')
      fn(root)
    })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

function write(root: string, relative: string, value: unknown) {
  const file = path.join(root, relative)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value))
}

test('Documents writes use project metadata and share file identity with Files', () => fixture(root => {
  assert.deepEqual(listThreads('docs', 'a.md'), [])
  assert.deepEqual(readTableLayout('docs', 'a.md'), [])
  assert.equal(readFrontmatterOptions('docs', 'status'), null)
  assert.equal(fs.existsSync(path.join(root, '.mew/docs/.mew')), false)

  const thread = addThread('docs', 'a.md', anchor, author.email, 'first')
  assert.equal(listThreads(WORKSPACE_PROJECT, '.mew/docs/a.md')[0].id, thread.id)
  addComment('docs', 'a.md', thread.id, author.email, 'reply')
  const reply = listThreads('docs', 'a.md')[0].comments[1]
  editComment('docs', 'a.md', thread.id, reply.id, author, 'edited')
  assert.equal(listThreads(WORKSPACE_PROJECT, '.mew/docs/a.md')[0].comments[1].text, 'edited')
  deleteComment('docs', 'a.md', thread.id, reply.id, author)
  deleteComment('docs', 'a.md', thread.id, thread.comments[0].id, author)
  assert.deepEqual(listThreads(WORKSPACE_PROJECT, '.mew/docs/a.md'), [])

  writeTableLayout('docs', 'a.md', [[120, 240]])
  assert.deepEqual(readTableLayout(WORKSPACE_PROJECT, '.mew/docs/a.md'), [[120, 240]])
  updateFrontmatterOptions('docs', 'status', { add: ['Draft'], optionColors: { Draft: 210 } })
  assert.deepEqual(readFrontmatterOptions(WORKSPACE_PROJECT, 'status'), ['Draft'])
  assert.equal(fs.existsSync(path.join(root, '.mew/docs/.mew')), false)
  for (const name of ['comments', 'table-layout', 'frontmatter-options']) {
    assert.ok(fs.existsSync(path.join(root, `.mew/${name}.json`)))
  }
}))

test('plain and custom Documents locations keep metadata outside their document trees', () => fixture(root => {
  for (const directory of ['docs', 'notes/reference']) {
    setDocsDir(directory)
    addThread('docs', 'same.md', anchor, author.email, directory)
    writeTableLayout('docs', 'same.md', [[directory === 'docs' ? 100 : 200]])
    updateFrontmatterOptions('docs', 'status', { add: ['Draft'] })
    assert.equal(fs.existsSync(path.join(root, directory, '.mew')), false)
    assert.equal(listThreads(WORKSPACE_PROJECT, `${directory}/same.md`)[0].comments[0].text, directory)
  }
  setDocsDir('docs')
  assert.equal(listThreads('docs', 'same.md')[0].comments[0].text, 'docs')
  assert.deepEqual(readTableLayout('docs', 'same.md'), [[100]])
  fs.mkdirSync(path.join(root, 'child'))
  addThread('child', 'same.md', anchor, author.email, 'child')
  writeTableLayout('child', 'same.md', [[300]])
  updateFrontmatterOptions('child', 'status', { add: ['Child'] })
  assert.deepEqual(readFrontmatterOptions('docs', 'status'), ['Draft'])
  assert.deepEqual(readFrontmatterOptions('child', 'status'), ['Child'])
  assert.ok(fs.existsSync(path.join(root, 'child/.mew/comments.json')))
}))

test('legacy comments merge threads and replies without duplicating IDs', () => fixture(root => {
  const thread = addThread(WORKSPACE_PROJECT, '.mew/docs/a.md', anchor, author.email, 'current')
  const oldComment = { id: 'legacy-reply', author: author.email, time: 1, text: 'legacy' }
  const other = { ...thread, id: 'other-thread', comments: [oldComment] }
  write(root, '.mew/docs/.mew/comments.json', {
    version: 1, docs: { 'a.md': [{ ...thread, comments: [...thread.comments, oldComment] }, other] },
  })
  const threads = listThreads('docs', 'a.md')
  assert.equal(threads.length, 2)
  assert.equal(threads[0].comments.length, 2)
  assert.ok(threads[0].comments.some(comment => comment.text === 'legacy'))
  assert.deepEqual(listThreads('docs', 'a.md'), threads)
  assert.equal(fs.existsSync(path.join(root, '.mew/docs/.mew')), false)
}))

test('legacy widths and shared options merge while retaining unrelated files and current values', () => fixture(root => {
  writeTableLayout(WORKSPACE_PROJECT, '.mew/docs/a.md', [[240]])
  write(root, '.mew/docs/.mew/table-layout.json', { version: 1, docs: { 'a.md': [[120]], 'b.md': [[180]] } })
  write(root, '.mew/docs/.mew/keep.json', { keep: true })
  assert.deepEqual(readTableLayout('docs', 'a.md'), [[240]])
  assert.deepEqual(readTableLayout('docs', 'b.md'), [[180]])
  updateFrontmatterOptions(WORKSPACE_PROJECT, 'status', { add: ['Current'], optionColors: { Current: 210 } })
  write(root, '.mew/docs/.mew/frontmatter-options.json', {
    version: 1, fields: { status: ['Legacy', 'Current'] }, colors: { status: { Legacy: 130, Current: 50 } },
  })
  assert.deepEqual(readFrontmatterOptions('docs', 'status'), ['Legacy', 'Current'])
  assert.deepEqual(readFrontmatterOptionColors('docs', 'status'), { Legacy: 130, Current: 210 })
  assert.deepEqual(readFrontmatterOptions('docs', 'status'), ['Legacy', 'Current'])
  assert.ok(fs.existsSync(path.join(root, '.mew/docs/.mew/keep.json')))
  assert.equal(fs.existsSync(path.join(root, '.mew/docs/.mew/table-layout.json')), false)
  assert.equal(fs.existsSync(path.join(root, '.mew/docs/.mew/frontmatter-options.json')), false)
}))

test('invalid legacy or destination metadata stops migration and preserves both originals', () => fixture(root => {
  for (const name of ['comments', 'table-layout', 'frontmatter-options']) {
    const legacy = `.mew/docs/.mew/${name}.json`
    const canonical = `.mew/${name}.json`
    const access = () => name === 'comments' ? listThreads('docs', 'a.md')
      : name === 'table-layout' ? readTableLayout('docs', 'a.md') : readFrontmatterOptions('docs', 'status')
    for (const invalid of ['{broken', JSON.stringify({ version: 2, docs: {}, fields: {} })]) {
      write(root, legacy, { version: 1, docs: {}, fields: {} })
      fs.writeFileSync(path.join(root, canonical), invalid)
      const before = fs.readFileSync(path.join(root, legacy), 'utf8')
      assert.throws(access)
      assert.equal(fs.readFileSync(path.join(root, canonical), 'utf8'), invalid)
      assert.equal(fs.readFileSync(path.join(root, legacy), 'utf8'), before)
      fs.rmSync(path.join(root, canonical))
      fs.writeFileSync(path.join(root, legacy), invalid)
      assert.throws(access)
      assert.equal(fs.readFileSync(path.join(root, legacy), 'utf8'), invalid)
      assert.equal(fs.existsSync(path.join(root, canonical)), false)
    }
  }
}))

test('migration refuses symbolic links in legacy and destination paths', () => fixture(root => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-metadata-outside-'))
  try {
    fs.mkdirSync(path.join(root, '.mew/docs'), { recursive: true })
    fs.symlinkSync(outside, path.join(root, '.mew/docs/.mew'))
    assert.throws(() => listThreads('docs', 'a.md'), /심볼릭/)
    fs.unlinkSync(path.join(root, '.mew/docs/.mew'))
    write(root, '.mew/docs/.mew/comments.json', { version: 1, docs: {} })
    fs.writeFileSync(path.join(outside, 'comments.json'), '{untouched')
    fs.symlinkSync(path.join(outside, 'comments.json'), path.join(root, '.mew/comments.json'))
    assert.throws(() => listThreads('docs', 'a.md'), /심볼릭/)
    assert.equal(fs.readFileSync(path.join(outside, 'comments.json'), 'utf8'), '{untouched')
  } finally {
    fs.rmSync(outside, { recursive: true, force: true })
  }
}))

test('failed publication preserves the legacy file and the canonical data for retry', t => fixture(root => {
  write(root, '.mew/comments.json', { version: 1, docs: {} })
  write(root, '.mew/docs/.mew/comments.json', { version: 1, docs: { 'a.md': [] } })
  const canonical = fs.readFileSync(path.join(root, '.mew/comments.json'), 'utf8')
  const legacy = fs.readFileSync(path.join(root, '.mew/docs/.mew/comments.json'), 'utf8')
  const rename = t.mock.method(fs, 'renameSync', () => { throw new Error('publication failed') })
  try {
    assert.throws(() => listThreads('docs', 'a.md'), /publication failed/)
    assert.equal(fs.readFileSync(path.join(root, '.mew/comments.json'), 'utf8'), canonical)
    assert.equal(fs.readFileSync(path.join(root, '.mew/docs/.mew/comments.json'), 'utf8'), legacy)
    assert.deepEqual(fs.readdirSync(path.join(root, '.mew')).sort(), ['comments.json', 'docs'])
  } finally {
    rename.mock.restore()
  }
  assert.deepEqual(listThreads('docs', 'a.md'), [])
  assert.equal(fs.existsSync(path.join(root, '.mew/docs/.mew')), false)
}))
