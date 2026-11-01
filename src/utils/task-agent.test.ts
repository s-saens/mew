import test from 'node:test'
import assert from 'node:assert/strict'
import { taskAgentFile, taskAgentPrompt, taskAgentTitle } from './task-agent.ts'

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

test('task agent uses the task title and localized document-first instructions with an exact file reference', () => {
  assert.equal(taskAgentTitle('---\ntitle: "Task: latest title"\n---\n\nBody', 'Fallback.md'), 'Task: latest title')
  assert.equal(taskAgentTitle('No metadata', '.mew/tasks/Fallback.md'), 'Fallback')
  const file = { project: '.workspace', path: '.mew/tasks/Task with spaces (1).md' }
  const expected = {
    ko: '먼저 정리한 이후', en: 'First organize', 'zh-CN': '请先整理', ja: '先に整理してから',
  } as const
  const prompts = new Set<string>()
  for (const locale of ['ko', 'en', 'zh-CN', 'ja'] as const) {
    const prompt = taskAgentPrompt(file, locale)
    assert.ok(prompt.startsWith('[[.workspace:.mew/tasks/Task with spaces (1).md]]\n\n'))
    assert.ok(prompt.includes(expected[locale]))
    prompts.add(prompt)
  }
  assert.equal(prompts.size, 4)
})
