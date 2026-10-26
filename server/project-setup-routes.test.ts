import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import express from 'express'
import { createProjectSetupRouter } from './project-setup-routes.ts'
import { WORKSPACE_ROOT, setWorkspaceRoot } from './paths.ts'
import { defaultAgentSettings, readProjectAgentSettings, writeProjectAgentSettings } from './project-agent-settings.ts'
import { agentContextText } from './agent-context.ts'
import type { ProjectGuidanceSnapshot } from '../shared/project-agent-context.ts'

test('setup API enforces owner and project binding, previews without writes, rejects stale apply', async () => {
  const previous = WORKSPACE_ROOT
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-setup-api-'))
  fs.mkdirSync(path.join(root, 'docs'))
  setWorkspaceRoot(root)
  let role: 'owner' | 'manager' | 'member' | 'guest' = 'owner'
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as express.Request & { auth?: unknown }).auth = { role, email: role === 'guest' ? null : 'setup@example.test', mustChangePassword: false }
    next()
  })
  app.use('/setup', createProjectSetupRouter())
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/setup`
  const post = (body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  try {
    const input = { projectRoot: root, settings: defaultAgentSettings(), initDocs: true }
    for (const denied of ['manager', 'member', 'guest'] as const) {
      role = denied
      assert.ok([401, 403].includes((await fetch(url)).status))
      assert.ok([401, 403].includes((await post({ ...input, action: 'apply' })).status))
    }
    role = 'owner'
    assert.equal((await fetch(url)).status, 200)
    assert.equal((await post({ ...input, projectRoot: `${root}/other`, action: 'preview' })).status, 409)
    const preview = await post({ ...input, action: 'preview' })
    assert.equal(preview.status, 200)
    const plan = await preview.json() as { revision: string }
    assert.equal(fs.existsSync(path.join(root, '.mew')), false)
    assert.equal((await post({ ...input, action: 'apply', revision: 'stale' })).status, 400)
    const applied = await post({ ...input, action: 'apply', revision: plan.revision })
    assert.equal(applied.status, 200, await applied.text())
    assert.ok(fs.existsSync(path.join(root, 'docs/AGENT.md')))
    assert.equal((await post({ ...input, settings: { ...input.settings, docsDir: '../escape' }, action: 'preview' })).status, 400)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    setWorkspaceRoot(previous)
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('project guidance updates are owner-only, preserve document settings and reject stale or cross-project saves', async () => {
  const previous = WORKSPACE_ROOT
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-guidance-api-'))
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-guidance-other-'))
  const original = { ...defaultAgentSettings('notes'), entrypoints: ['AGENTS.md', 'notes/README.md'], instructions: 'Existing project rule' }
  writeProjectAgentSettings(root, original)
  setWorkspaceRoot(root)
  let role: 'owner' | 'manager' | 'member' | 'guest' = 'owner'
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    ;(req as express.Request & { auth?: unknown }).auth = { role, email: role === 'guest' ? null : 'guidance@example.test', mustChangePassword: false }
    next()
  })
  app.use('/setup', createProjectSetupRouter())
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/setup`
  const read = async () => await (await fetch(url)).json() as ProjectGuidanceSnapshot
  const patch = (body: unknown) => fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const context = (projectRoot: string) => agentContextText({ projectRoot, docsRoot: path.join(projectRoot, projectRoot === root ? 'notes' : 'docs') }, projectRoot)
  try {
    const initialResponse = await fetch(url)
    assert.equal(initialResponse.status, 200)
    assert.equal(initialResponse.headers.get('cache-control'), 'no-store')
    const initial = await initialResponse.json() as ProjectGuidanceSnapshot
    assert.deepEqual(initial.settings, original)
    assert.ok(initial.revision)
    for (const denied of ['manager', 'member', 'guest'] as const) {
      role = denied
      assert.ok([401, 403].includes((await patch({ projectRoot: root, revision: initial.revision, instructions: 'Denied' })).status))
      assert.deepEqual(readProjectAgentSettings(root), original)
    }
    role = 'owner'
    for (const body of [
      { projectRoot: other, revision: initial.revision, instructions: 'Wrong project' },
      { projectRoot: root, revision: 'stale', instructions: 'Stale change' },
      { projectRoot: root, instructions: 'Missing revision' },
    ]) assert.equal((await patch(body)).status, 409)
    for (const body of [
      { instructions: 'x'.repeat(8001) },
      { instructions: 123 },
      { instructions: 'Rule', enabled: 'true' },
    ]) assert.equal((await patch({ projectRoot: root, revision: initial.revision, ...body })).status, 400)
    assert.deepEqual(readProjectAgentSettings(root), original)
    const saved = await patch({
      projectRoot: root, revision: initial.revision, instructions: 'New project-only rule',
      settings: { ...defaultAgentSettings(), docsDir: '../escape' }, docsDir: 'elsewhere', entrypoints: ['other.md'],
    })
    assert.equal(saved.status, 200)
    const state = await saved.json() as ProjectGuidanceSnapshot
    assert.deepEqual(state.settings, { ...original, instructions: 'New project-only rule' })
    assert.notEqual(state.revision, initial.revision)
    assert.match(context(root), /New project-only rule/)
    assert.doesNotMatch(context(root), /Existing project rule/)
    assert.doesNotMatch(context(other), /New project-only rule/)
    assert.equal(fs.existsSync(path.join(root, 'notes')), false, 'saving instructions does not initialize documents')
    assert.equal((await patch({ projectRoot: root, revision: initial.revision, instructions: 'Stale overwrite' })).status, 409)

    writeProjectAgentSettings(root, { ...state.settings, entrypoints: ['notes/new-rules.md'] })
    assert.equal((await patch({ projectRoot: root, revision: state.revision, instructions: 'Overwrite external changes' })).status, 409, 'edits outside the dialog invalidate its revision')
    let latest = await read()
    let response = await patch({ projectRoot: root, revision: latest.revision, instructions: 'x'.repeat(8000), enabled: false })
    assert.equal(response.status, 200)
    latest = await response.json() as ProjectGuidanceSnapshot
    assert.equal(latest.settings.instructions.length, 8000)
    assert.deepEqual(latest.settings.entrypoints, ['notes/new-rules.md'])
    assert.equal(context(root), '', 'the next request respects the disabled project context')
    response = await patch({ projectRoot: root, revision: latest.revision, instructions: '', enabled: true })
    assert.equal(response.status, 200)
    latest = await response.json() as ProjectGuidanceSnapshot
    assert.equal(latest.settings.instructions, '')
    assert.equal(latest.settings.docsDir, 'notes')
    assert.deepEqual(latest.settings.entrypoints, ['notes/new-rules.md'])
    assert.notEqual(context(root), '')

    setWorkspaceRoot(other)
    assert.equal((await patch({ projectRoot: root, revision: latest.revision, instructions: 'Saved after switching' })).status, 409)
    assert.equal(readProjectAgentSettings(other), null)
    assert.equal(readProjectAgentSettings(root)?.instructions, '')
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    setWorkspaceRoot(previous)
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(other, { recursive: true, force: true })
  }
})
