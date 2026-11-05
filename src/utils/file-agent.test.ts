import test from 'node:test'
import assert from 'node:assert/strict'
import { fileAgentDraft, fileAgentTitle } from './file-agent.ts'
import { editorFile } from './editor-files.ts'
import { documentReferenceTokens, uploadedAttachmentTokens, withoutAttachmentTokens } from './agent-attachments.ts'

test('file agent uses current Markdown titles and filenames for every other format', () => {
  assert.equal(fileAgentTitle('---\ntitle: "Latest document title"\n---\nBody', 'guide.md'), 'Latest document title')
  assert.equal(fileAgentTitle('No metadata', 'notes/Fallback.md'), 'Fallback')
  assert.equal(fileAgentTitle('---\ntitle: " "\n---\n', 'notes/UPPER.MD'), 'UPPER')
  for (const path of ['src/main.ts', 'report.pdf', 'picture.png', 'vector.svg', 'audio.mp3', 'video.mp4', 'sheet.xlsx', 'archive.zip', 'LICENSE']) {
    assert.equal(fileAgentTitle('---\ntitle: Not a Markdown title\n---\n', path), path.split('/').at(-1), path)
  }
})

test('file agent prepares exactly one titled reference across project, Documents and external file scopes', () => {
  for (const tabPath of ['.mew/tasks/Task.md', 'notes.md', 'mew:file:docs/nested/Guide.md', 'mew:file:other/main.ts', '@fs:/outside/report.pdf']) {
    const file = editorFile(tabPath, '.workspace')
    const title = fileAgentTitle('', file.path)
    const draft = fileAgentDraft(file, title)
    const [reference] = documentReferenceTokens(draft)
    assert.equal(reference.token, draft, 'no preset instructions or surrounding text')
    assert.deepEqual({ project: reference.project, path: reference.path, title: reference.title }, { ...file, title })
    assert.equal(documentReferenceTokens(draft).length, 1)
  }
})

test('titled references round-trip special characters and files under upload directories without becoming attachments', () => {
  const title = '문서 [title] | spaces \\ and\nnew lines'
  for (const path of ['notes/[draft] | name\\part #1%.md', '.mew/temp/assets/보고서.pdf', '.mew/assets/photo.png', '.mew/files/old.pdf']) {
    const draft = fileAgentDraft({ project: '.workspace', path }, title)
    const [reference] = documentReferenceTokens(draft)
    assert.equal(reference.path, path)
    assert.equal(reference.title, title)
    assert.deepEqual(uploadedAttachmentTokens(draft), [])
    assert.equal(withoutAttachmentTokens(draft), draft)
    const text = `before ${draft} after ${draft}`
    for (const token of documentReferenceTokens(text)) assert.equal(text.slice(token.from, token.to), draft)
  }
})
