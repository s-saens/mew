import assert from 'node:assert/strict'
import test from 'node:test'
import { projectWorkspaceView } from './project-workspace-view.ts'

const account = { canOpenProjects: true, shortcutsLoaded: true, paths: ['/project'], hasProject: true }

test('waits for both active-project metadata and the personal shortcut list', () => {
  assert.equal(projectWorkspaceView({ ...account, hasProject: null }), 'loading')
  assert.equal(projectWorkspaceView({ ...account, shortcutsLoaded: false }), 'loading')
  assert.equal(projectWorkspaceView({ ...account, shortcutsLoaded: false, paths: [], hasProject: false }), 'loading')
})

test('an empty favorite list keeps an authorized active project open', () => {
  assert.equal(projectWorkspaceView({ ...account, paths: [] }), 'workspace')
  assert.equal(projectWorkspaceView({ ...account, paths: [], hasProject: false }), 'setup')
})

test('the setup surface recovers an account with shortcuts but no active root', () => {
  assert.equal(projectWorkspaceView({ ...account, hasProject: false }), 'setup')
})

test('removing the last shortcut and adding a project change the workspace presentation', () => {
  assert.equal(projectWorkspaceView(account), 'workspace')
  assert.equal(projectWorkspaceView({ ...account, paths: [] }), 'workspace')
  assert.equal(projectWorkspaceView({ ...account, paths: ['/new-project'] }), 'workspace')
})

test('guest and fixed-project sessions do not require a personal shortcut list', () => {
  assert.equal(projectWorkspaceView({ ...account, canOpenProjects: false, shortcutsLoaded: false, paths: [] }), 'workspace')
  assert.equal(projectWorkspaceView({ ...account, canOpenProjects: false, shortcutsLoaded: false, paths: [], hasProject: null }), 'loading')
})
