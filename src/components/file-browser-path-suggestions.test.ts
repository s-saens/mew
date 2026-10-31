import test from 'node:test'
import assert from 'node:assert/strict'
import { currentFolderPathSuggestions, resolveFileBrowserDraft } from './file-browser-path-suggestions.ts'

const listing = {
  path: '/home/test', parent: '/home', entries: [
    { name: 'mew', path: '/home/test/mew', type: 'dir' as const, size: null },
    { name: 'memo', path: '/home/test/memo', type: 'dir' as const, size: null },
    { name: 'meeting.md', path: '/home/test/meeting.md', type: 'file' as const, size: null },
  ],
}

test('path suggestions immediately reuse known children and distinguish an empty prefix match from another directory', () => {
  assert.deepEqual(currentFolderPathSuggestions('/home/test', listing)?.map(item => item.name), ['mew', 'memo'])
  assert.deepEqual(currentFolderPathSuggestions('/home/test/me', listing)?.map(item => item.name), ['mew', 'memo'])
  assert.deepEqual(currentFolderPathSuggestions('mew', listing)?.map(item => item.name), ['mew'])
  assert.deepEqual(currentFolderPathSuggestions('/home/test/unknown', listing), [])
  assert.equal(currentFolderPathSuggestions('/home/test/mew/', listing), null)
  assert.equal(currentFolderPathSuggestions('/elsewhere/me', listing), null)
  assert.equal(currentFolderPathSuggestions('~/me', listing), null)
  assert.equal(currentFolderPathSuggestions('', listing), null)
})

test('navigation resolves relative paths against the displayed folder and retains server home expansion', () => {
  assert.equal(resolveFileBrowserDraft('../other/./project', '/home/test'), '/home/other/project')
  assert.equal(resolveFileBrowserDraft('./mew', '/home/test'), '/home/test/mew')
  assert.equal(resolveFileBrowserDraft('/home/test/../mew/', '/other'), '/home/mew')
  assert.equal(resolveFileBrowserDraft('~/mew', '/home/test'), '~/mew')
  assert.equal(resolveFileBrowserDraft('~', '/home/test'), '~')
  assert.equal(resolveFileBrowserDraft('', '/home/test'), '')
  assert.equal(resolveFileBrowserDraft('mew', ''), 'mew')
  assert.equal(resolveFileBrowserDraft('../../../../', '/home/test'), '/')
})
