import test from 'node:test'
import assert from 'node:assert/strict'
import { taskAgentFile } from './task-agent.ts'

test('task agent resolves workspace and Documents scopes without treating guides or unrelated files as tasks', () => {
  const workspace = { path: '/work', docsPath: '/work/.mew/docs' }
  assert.deepEqual(taskAgentFile('.mew/tasks/Task.md', '.workspace', workspace), { project: '.workspace', path: '.mew/tasks/Task.md' })
  assert.deepEqual(taskAgentFile('.mew/tasks/Done/Task.md', '.workspace', workspace), { project: '.workspace', path: '.mew/tasks/Done/Task.md' })
  assert.deepEqual(taskAgentFile('tasks/Task.md', 'docs', { path: '/work', docsPath: '/work/docs' }), { project: 'docs', path: 'tasks/Task.md' })
  assert.equal(taskAgentFile('tasks/Task.md', 'docs', workspace), null)
  assert.equal(taskAgentFile('tasks/Task.md', 'docs', { path: '/work', docsPath: '/outside' }), null)
  for (const path of ['notes.md', '.mew/tasks/_tasks.md', '.mew/tasks/README.md', '.mew/tasks/Task.txt', '.mew/tasks/nested/Task.md']) {
    assert.equal(taskAgentFile(path, '.workspace', workspace), null, path)
  }
  assert.deepEqual(taskAgentFile('mew:file:docs/tasks/Task.md', '.workspace', { path: '/work', docsPath: '/work/docs' }), { project: 'docs', path: 'tasks/Task.md' })
})

test('ordinary files in task directories use the general file action instead of task identity lookup', () => {
  const path = '.mew/tasks/Notes.md'
  for (const content of ['Ordinary notes', '---\ntitle: Notes\n---\n\nBody']) {
    assert.equal(taskAgentFile(path, '.workspace', null, content), null)
  }
  for (const done of ['false', 'true', '"false"']) {
    assert.deepEqual(taskAgentFile(path, '.workspace', null, `---\ntitle: A task\ndone: ${done}\n---\n\nBody`), { project: '.workspace', path })
  }
})
