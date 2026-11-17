import test from 'node:test'
import assert from 'node:assert/strict'
import { remoteGitFailure } from './git-remote-error.ts'

test('GitHub workflow scope rejection gives a safe reauthorization instruction', () => {
  const error = remoteGitFailure({ stderr: "remote: error: refusing to allow an OAuth App to create or update workflow `.github/workflows/test.yml` without `workflow` scope\nsecret-token" })
  assert.equal(error.code, 'git-workflow-scope-required')
  assert.match(error.message, /워크플로 권한/)
  assert.doesNotMatch(error.message, /secret-token|test\.yml/)
})

test('unrecognized failures do not expose Git output', () => {
  const error = remoteGitFailure({ stderr: 'remote: secret-token' })
  assert.equal(error.code, 'git-remote-failed')
  assert.doesNotMatch(error.message, /secret-token/)
})
