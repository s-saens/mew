import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ReleaseProvidersService, ReleaseProviderError } from './release-providers.ts'
import type { ReleaseConnectionConfig } from '../shared/release-providers.ts'

const github: ReleaseConnectionConfig = { provider: 'github-actions', label: 'My website', owner: 'owner', repo: 'website', workflow: 'release.yml', ref: 'main' }
const pages: ReleaseConnectionConfig = { provider: 'cloudflare-pages', label: 'My Pages website', accountId: 'a'.repeat(32), projectName: 'my-site', branch: 'main' }
const google: ReleaseConnectionConfig = { provider: 'google-cloud-build', label: 'My Google website', projectId: 'my-project', location: 'us-central1', triggerId: 'trigger-id', branch: 'main' }

function fixture(t: test.TestContext, request: typeof fetch) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-release-providers-'))
  const root = path.join(temporary, 'project'), storage = path.join(temporary, 'private')
  fs.mkdirSync(root)
  const service = new ReleaseProvidersService({ storage, request })
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  return { root, storage, service }
}

test('provider credentials are encrypted, isolated by account and project, and retained on a token-free edit', t => {
  const { root, storage, service } = fixture(t, async () => { throw new Error('No network expected') })
  const connection = service.save(root, 'alice', { config: github, token: 'private-token-alice' })
  assert.equal(connection.connected, true)
  assert.equal(JSON.stringify(connection).includes('private-token-alice'), false)
  assert.deepEqual(service.state(root, 'bob').connections, [])
  const other = path.join(path.dirname(root), 'other'); fs.mkdirSync(other)
  assert.deepEqual(service.state(other, 'alice').connections, [])
  const modified = service.save(root, 'alice', { id: connection.id, config: { ...github, label: 'New name' } })
  assert.equal(modified.connected, true)
  const reloaded = new ReleaseProvidersService({ storage, request: async () => { throw new Error('No network expected') } })
  assert.equal(reloaded.state(root, 'alice').connections[0].label, 'New name')
  const records = fs.readdirSync(storage, { recursive: true }).filter(file => String(file).endsWith('.json'))
  assert.equal(records.length, 1)
  const file = path.join(storage, String(records[0]))
  assert.equal(fs.readFileSync(file, 'utf8').includes('private-token-alice'), false)
  assert.equal(fs.statSync(file).mode & 0o777, 0o600)
  assert.throws(() => service.remove(root, 'bob', connection.id), ReleaseProviderError)
  service.remove(root, 'alice', connection.id)
  assert.deepEqual(service.state(root, 'alice').connections, [])
})

test('GitHub dispatch records the returned run ID, deduplicates requests and refreshes exactly that run', async t => {
  const calls: Array<{ url: string; method: string; body: unknown }> = []
  const { root, storage, service } = fixture(t, async (url, options) => {
    assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer private-github-token')
    assert.equal(options?.redirect, 'error')
    calls.push({ url: String(url), method: options?.method ?? 'GET', body: options?.body ? JSON.parse(String(options.body)) : null })
    if (String(url).endsWith('/dispatches')) return Response.json({ workflow_run_id: 123, html_url: 'https://github.com/owner/website/actions/runs/123' })
    if (String(url).endsWith('/runs/123/jobs?per_page=100')) return Response.json({ jobs: [{ id: 9, name: 'Build', status: 'completed', conclusion: 'success', steps: [{ number: 1, name: 'Compile', status: 'completed', conclusion: 'success' }] }] })
    assert.equal(String(url), 'https://api.github.com/repos/owner/website/actions/runs/123')
    return Response.json({ id: 123, status: 'completed', conclusion: 'success', html_url: 'https://github.com/owner/website/actions/runs/123' })
  })
  const connection = service.save(root, 'alice', { config: github, token: 'private-github-token' })
  const [a, b] = await Promise.all([service.start(root, 'alice', connection.id, 'request-1'), service.start(root, 'alice', connection.id, 'request-1')])
  assert.equal(a.id, b.id)
  assert.equal(a.providerRunId, '123')
  assert.equal(a.state, 'queued')
  assert.equal(calls.filter(call => call.method === 'POST').length, 1)
  await assert.rejects(service.start(root, 'alice', connection.id, 'request-2'), /이미 실행/)
  assert.equal(new URL(calls[0].url).hostname, 'api.github.com')
  assert.deepEqual(calls[0].body, { ref: 'main', return_run_details: true })
  const reloaded = new ReleaseProvidersService({ storage, request: (url, options) => {
    assert.equal(options?.method ?? 'GET', 'GET')
    if (String(url).includes('/jobs')) return Promise.resolve(Response.json({ jobs: [] }))
    assert.equal(String(url), 'https://api.github.com/repos/owner/website/actions/runs/123')
    return Promise.resolve(Response.json({ id: 123, status: 'completed', conclusion: 'success' }))
  } })
  assert.equal((await reloaded.refresh(root, 'alice', a.id)).state, 'succeeded')
  const completed = await service.refresh(root, 'alice', a.id)
  assert.equal(completed.steps[0].label, 'Build')
  assert.equal(completed.state, 'succeeded')
})

test('Cloudflare Pages creates from a configured branch and keeps only safe deployment metadata', async t => {
  const { root, service } = fixture(t, async (url, options) => {
    assert.equal(String(url).startsWith(`https://api.cloudflare.com/client/v4/accounts/${'a'.repeat(32)}/pages/projects/my-site/deployments`), true)
    if (options?.method === 'POST') {
      assert.ok(options.body instanceof FormData)
      assert.equal(options.body.get('branch'), 'main')
      return Response.json({ success: true, result: { id: 'deploy-123', url: 'https://deploy.my-site.pages.dev', env_vars: { SECRET: { value: 'must-not-leak' } }, latest_stage: { name: 'build', status: 'active' }, stages: [{ name: 'build', status: 'active' }] } })
    }
    assert.equal(String(url).endsWith('/deploy-123'), true)
    return Response.json({ success: true, result: { id: 'deploy-123', url: 'https://deploy.my-site.pages.dev', latest_stage: { name: 'deploy', status: 'success' }, stages: [{ name: 'build', status: 'success' }, { name: 'deploy', status: 'success' }] } })
  })
  const connection = service.save(root, 'alice', { config: pages, token: 'private-pages-token' })
  const run = await service.start(root, 'alice', connection.id, 'pages-1')
  assert.equal(run.providerRunId, 'deploy-123')
  assert.equal(run.state, 'running')
  assert.equal(run.resultUrl, undefined, 'an unfinished deployment is not a published result')
  const completed = await service.refresh(root, 'alice', run.id)
  assert.equal(completed.resultUrl, 'https://deploy.my-site.pages.dev/')
  assert.equal(completed.state, 'succeeded')
  assert.equal(JSON.stringify(service.state(root, 'alice')).includes('must-not-leak'), false)
})

test('Google regional trigger tracks the exact operation build and maps steps without exposing raw substitutions', async t => {
  const { root, service } = fixture(t, async (url, options) => {
    assert.equal(new URL(String(url)).hostname, 'cloudbuild.googleapis.com')
    if (options?.method === 'POST') {
      assert.equal(String(url), 'https://cloudbuild.googleapis.com/v1/projects/my-project/locations/us-central1/triggers/trigger-id:run')
      assert.deepEqual(JSON.parse(String(options.body)), { projectId: 'my-project', triggerId: 'trigger-id', source: { branchName: 'main' } })
      return Response.json({ name: 'projects/my-project/locations/us-central1/operations/op-1', metadata: { build: { id: 'build-123', name: 'projects/my-project/locations/us-central1/builds/build-123', status: 'QUEUED' } } })
    }
    assert.equal(String(url), 'https://cloudbuild.googleapis.com/v1/projects/my-project/locations/us-central1/builds/build-123')
    return Response.json({ id: 'build-123', status: 'SUCCESS', logUrl: 'https://console.cloud.google.com/cloud-build/builds;region=us-central1/build-123?project=my-project', substitutions: { SECRET: 'must-not-leak' }, steps: [{ id: 'Build', status: 'SUCCESS' }] })
  })
  const connection = service.save(root, 'alice', { config: google, token: 'private-google-token' })
  const run = await service.start(root, 'alice', connection.id, 'google-1')
  assert.equal(run.providerRunId, 'build-123')
  assert.equal((await service.refresh(root, 'alice', run.id)).state, 'succeeded')
  assert.equal(JSON.stringify(service.state(root, 'alice')).includes('must-not-leak'), false)
})

test('ambiguous dispatch never retries or substitutes the latest remote run', async t => {
  let requests = 0
  const { root, service } = fixture(t, async () => { requests++; throw new Error('private-token transport-failed') })
  const connection = service.save(root, 'alice', { config: github, token: 'private-token' })
  const run = await service.start(root, 'alice', connection.id, 'uncertain-1')
  assert.equal(run.state, 'unknown')
  assert.equal((await service.start(root, 'alice', connection.id, 'uncertain-1')).id, run.id)
  assert.equal((await service.refresh(root, 'alice', run.id)).state, 'unknown')
  assert.equal(requests, 1)
  assert.equal(JSON.stringify(service.state(root, 'alice')).includes('private-token'), false)
})

test('provider configuration rejects traversal, arbitrary hosts and unbounded inputs before saving', t => {
  const { root, service } = fixture(t, async () => { throw new Error('No network expected') })
  for (const config of [
    { ...github, owner: '../secret' }, { ...github, workflow: '../release.yml' }, { ...github, ref: 'main\nother' },
    { ...pages, accountId: 'https://attacker.test' }, { ...google, location: '../global' },
    { ...github, provider: 'arbitrary' }, { ...github, inputs: Object.fromEntries(Array.from({ length: 26 }, (_, i) => [`key${i}`, 'x'])) },
  ]) assert.throws(() => service.save(root, 'alice', { config: config as ReleaseConnectionConfig, token: 'token' }), ReleaseProviderError)
})

test('reviewed provider targets reject changes atomically while token rotation preserves the reviewed target', async t => {
  let requests = 0
  const { root, service } = fixture(t, async (_url, options) => {
    requests++
    assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer rotated-token')
    return Response.json({ workflow_run_id: 123 })
  })
  const connection = service.save(root, 'alice', { config: github, token: 'old-token' })
  service.save(root, 'alice', { id: connection.id, config: { ...github, ref: 'other' } })
  await assert.rejects(service.start(root, 'alice', connection.id, 'review-old', github), /검토한 공개 설정/)
  assert.equal(requests, 0)
  service.save(root, 'alice', { id: connection.id, config: github, token: 'rotated-token' })
  assert.equal((await service.start(root, 'alice', connection.id, 'review-new', github)).providerRunId, '123')
  assert.equal(requests, 1)
})

test('a different connection cannot borrow an in-flight request and disconnect cannot restore credentials', async t => {
  let finish!: (response: Response) => void
  const { root, service } = fixture(t, async () => new Promise(resolve => { finish = resolve }))
  const connection = service.save(root, 'alice', { config: github, token: 'private-token' })
  const other = service.save(root, 'alice', { config: pages, token: 'other-token' })
  const pending = service.start(root, 'alice', connection.id, 'pending-1')
  await assert.rejects(service.start(root, 'alice', other.id, 'pending-1'), /다른 공개 서비스/)
  service.remove(root, 'alice', connection.id)
  finish(Response.json({ workflow_run_id: 123 }))
  assert.equal((await pending).state, 'unknown')
  assert.deepEqual(service.state(root, 'alice').connections.map(item => item.id), [other.id])
})

test('a same-email replacement account cannot inherit or be repopulated with an old pending credential', async t => {
  let generation = 1, finish!: (response: Response) => void
  const { root, storage } = fixture(t, async () => { throw new Error('unused') })
  const service = new ReleaseProvidersService({ storage, accountVersion: () => generation, request: async () => new Promise(resolve => { finish = resolve }) })
  const connection = service.save(root, 'alice', { config: github, token: 'private-old-account-token' })
  const pending = service.start(root, 'alice', connection.id, 'account-1')
  generation = 2
  finish(Response.json({ workflow_run_id: 123 }))
  await assert.rejects(pending, /계정이나 프로젝트가 변경/)
  assert.deepEqual(service.state(root, 'alice'), { connections: [], runs: [] })
})

test('late refresh replies cannot roll a completed provider run back to running', async t => {
  let requests = 0, finishOld!: (response: Response) => void
  const { root, service } = fixture(t, async (url, options) => {
    if (options?.method === 'POST') return Response.json({ workflow_run_id: 123 })
    if (String(url).includes('/jobs')) return Response.json({ jobs: [] })
    requests++
    if (requests === 1) return new Promise(resolve => { finishOld = resolve })
    return Response.json({ id: 123, status: 'completed', conclusion: 'success' })
  })
  const connection = service.save(root, 'alice', { config: github, token: 'private-token' })
  const run = await service.start(root, 'alice', connection.id, 'concurrent-1')
  const old = service.refresh(root, 'alice', run.id)
  assert.equal((await service.refresh(root, 'alice', run.id)).state, 'succeeded')
  finishOld(Response.json({ id: 123, status: 'in_progress' }))
  assert.equal((await old).state, 'succeeded')
  assert.equal(service.state(root, 'alice').runs[0].state, 'succeeded')
})

test('a restarted service preserves intent and never resubmits a dispatch whose result was lost', async t => {
  let finish!: (response: Response) => void, requests = 0
  const { root, storage, service } = fixture(t, async () => { requests++; return new Promise(resolve => { finish = resolve }) })
  const connection = service.save(root, 'alice', { config: github, token: 'private-token' })
  const original = service.start(root, 'alice', connection.id, 'restart-1')
  const restarted = new ReleaseProvidersService({ storage, request: async () => { requests++; throw new Error('must not execute') } })
  const recovered = restarted.state(root, 'alice').runs[0]
  assert.equal(recovered.state, 'unknown')
  assert.equal((await restarted.start(root, 'alice', connection.id, 'restart-1')).id, recovered.id)
  finish(Response.json({ workflow_run_id: 123 }))
  assert.equal((await original).state, 'unknown')
  assert.equal(requests, 1)
})

test('Google operations without an initial build ID are polled by exact operation identity', async t => {
  const requests: string[] = []
  const { root, service } = fixture(t, async (url, options) => {
    requests.push(String(url))
    if (options?.method === 'POST') return Response.json({ name: 'projects/my-project/locations/us-central1/operations/op-1' })
    assert.equal(String(url), 'https://cloudbuild.googleapis.com/v1/projects/my-project/locations/us-central1/operations/op-1')
    return Response.json({ name: 'projects/my-project/locations/us-central1/operations/op-1', metadata: { build: { id: 'build-123', status: 'WORKING' } } })
  })
  const connection = service.save(root, 'alice', { config: google, token: 'private-token' })
  const run = await service.start(root, 'alice', connection.id, 'operation-1')
  assert.equal(run.providerRunId, undefined)
  assert.equal((await service.refresh(root, 'alice', run.id)).providerRunId, 'build-123')
  assert.equal(requests.length, 2)
})

test('legacy or oversized dispatch responses remain unknown and never expose provider error bodies', async t => {
  for (const response of [new Response(null, { status: 204 }), new Response('private-token'.repeat(200_000)), new Response('private-token raw error', { status: 503 })]) {
    const { root, service } = fixture(t, async () => response)
    const connection = service.save(root, 'alice', { config: github, token: 'private-token' })
    const run = await service.start(root, 'alice', connection.id, 'invalid-1')
    assert.equal(run.state, 'unknown')
    assert.equal(JSON.stringify(run).includes('private-token'), false)
  }
})

test('provider-provided labels and URLs cannot echo the connection token into API responses', async t => {
  const { root, service } = fixture(t, async () => Response.json({ success: true, result: { id: 'deploy-123', url: 'https://my-site.pages.dev/private-token', latest_stage: { name: 'deploy', status: 'success' }, stages: [{ name: 'private-token', status: 'success' }] } }))
  const connection = service.save(root, 'alice', { config: pages, token: 'private-token' })
  const run = await service.start(root, 'alice', connection.id, 'redaction-1')
  assert.equal(run.resultUrl, undefined)
  assert.equal(JSON.stringify(run).includes('private-token'), false)
})

test('skipped, neutral and unknown external outcomes never become a successful publication', async t => {
  for (const conclusion of ['skipped', 'cancelled', 'neutral', null, 'future-conclusion']) {
    const { root, service } = fixture(t, async (url, options) => {
      if (options?.method === 'POST') return Response.json({ workflow_run_id: 123 })
      if (String(url).includes('/jobs')) return Response.json({ jobs: [{ id: 9, name: 'Publish', status: 'completed', conclusion: 'skipped' }] })
      return Response.json({ id: 123, status: 'completed', conclusion })
    })
    const connection = service.save(root, 'alice', { config: github, token: 'private-token' })
    const run = await service.start(root, 'alice', connection.id, 'incomplete-1')
    const refreshed = await service.refresh(root, 'alice', run.id)
    assert.equal(refreshed.state, conclusion === 'skipped' || conclusion === 'cancelled' ? 'cancelled' : 'unknown')
    assert.equal(refreshed.steps[0].state, 'skipped')
    assert.equal(refreshed.resultUrl, undefined)
  }
  const { root, service } = fixture(t, async () => Response.json({ name: 'projects/my-project/locations/us-central1/operations/op-1', metadata: { build: { id: 'build-123', status: 'STATUS_UNKNOWN' } } }))
  const connection = service.save(root, 'alice', { config: google, token: 'private-token' })
  assert.equal((await service.start(root, 'alice', connection.id, 'unknown-1')).state, 'unknown')
})

test('exact request lookup recovers a remote ID after restart without dispatching or borrowing another scope', async t => {
  let requests = 0
  const { root, storage, service } = fixture(t, async () => { requests++; return Response.json({ workflow_run_id: 123 }) })
  const connection = service.save(root, 'alice', { config: github, token: 'private-token' })
  const run = await service.start(root, 'alice', connection.id, 'pipeline-123:publish')
  const restarted = new ReleaseProvidersService({ storage, request: async () => { requests++; throw new Error('lookup must not dispatch') } })
  const before = fs.readdirSync(storage, { recursive: true }).filter(file => String(file).endsWith('.json')).map(file => fs.readFileSync(path.join(storage, String(file)), 'utf8'))
  assert.deepEqual(restarted.findByRequestId(root, 'alice', 'pipeline-123:publish'), run)
  assert.equal(restarted.findByRequestId(root, 'alice', 'other-pipeline:publish'), undefined)
  assert.equal(restarted.findByRequestId(root, 'bob', 'pipeline-123:publish'), undefined)
  const other = path.join(path.dirname(root), 'other-project'); fs.mkdirSync(other)
  assert.equal(restarted.findByRequestId(other, 'alice', 'pipeline-123:publish'), undefined)
  const after = fs.readdirSync(storage, { recursive: true }).filter(file => String(file).endsWith('.json')).map(file => fs.readFileSync(path.join(storage, String(file)), 'utf8'))
  assert.deepEqual(after, before, 'the exact recovery lookup is read-only')
  assert.equal(requests, 1)
})
