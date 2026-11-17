import test from 'node:test'
import assert from 'node:assert/strict'
import { projectPanelCopy } from './project-panel-copy.ts'

test('project selection title uses the concise Korean label', () => {
  assert.equal(projectPanelCopy('ko').title, '프로젝트 선택')
})
