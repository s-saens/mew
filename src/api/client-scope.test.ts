import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'rolldown'
import type { WorkspaceClient } from './client.ts'
import type { AppRuntime } from '../runtime/app-runtime.ts'

async function fixture() {
  const client = new URL('./client.ts', import.meta.url).pathname
  const runtime = new URL('../runtime/app-runtime.ts', import.meta.url).pathname
  const bundle = await build({ input: 'virtual:scoped-client', write: false, platform: 'browser', output: { format: 'esm' },
    plugins: [{ name: 'scope-fixture', resolveId: id => id === 'virtual:scoped-client' ? id : undefined,
      load: id => id === 'virtual:scoped-client'
        ? `export { createWorkspaceClient, workspaceClient } from ${JSON.stringify(client)}; export { configureAppRuntime } from ${JSON.stringify(runtime)};` : undefined }],
  })
  return import(`data:text/javascript;base64,${Buffer.from(bundle.output.find(item => item.type === 'chunk')!.code).toString('base64')}`) as Promise<{
    createWorkspaceClient(scope: { workspacePath: string; projectPath: string }): WorkspaceClient
    workspaceClient: WorkspaceClient
    configureAppRuntime(runtime: AppRuntime): void
  }>
}

function installGlobals(t: { after(fn: () => void): void }) {
  for (const [key, value] of Object.entries({
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { pathname: '/', protocol: 'https:', host: 'device.test', origin: 'https://device.test' },
    window: new EventTarget(), document: Object.assign(new EventTarget(), { hidden: false }), WebSocket: { OPEN: 1, CONNECTING: 0 },
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { value, configurable: true })
    t.after(() => { if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key) })
  }
}

test('workspace clients capture independent roots for file, Git, task, resource and socket requests', async t => {
  installGlobals(t)
  const api = await fixture()
  const requests: { url: URL; init?: RequestInit }[] = []
  const resources: string[] = []
  const sockets: string[] = []
  let finishRead!: (response: Response) => void
  api.configureAppRuntime({
    transport: {
      fetch(input, init) {
        const url = new URL(String(input), 'https://device.test')
        requests.push({ url, init })
        if (url.pathname === '/api/file' && init?.method !== 'PUT') return new Promise(resolve => { finishRead = resolve })
        if (url.pathname === '/api/workspace') return Promise.resolve(Response.json({ workspaceScopeVersion: 1, path: '/projects/next', projectPath: '/projects/next' }))
        return Promise.resolve(Response.json(url.pathname === '/api/task-list' ? { canEdit: true, tasks: [] } : { ok: true }))
      },
      socket(url) { sockets.push(url); return { close() {} } as WebSocket }, close() {},
    },
    resourceUrl(url) { resources.push(url); return url },
    async prepareResourceUrl(url) { resources.push(url); return url },
  })
  const scope = { workspacePath: '/worktrees/a & b', projectPath: '/projects/a' }
  const a = api.createWorkspaceClient(scope)
  const b = api.createWorkspaceClient({ workspacePath: '/projects/b', projectPath: '/projects/b' })
  scope.workspacePath = '/changed'
  assert.equal(a.scope?.workspacePath, '/worktrees/a & b')
  assert.equal(Object.isFrozen(a.scope), true)
  assert.equal(a.getProject(), '.workspace')
  const pending = a.fetchFile('same.md')
  b.setProject('other')
  api.workspaceClient.setProject('focused')
  await b.saveFile('same.md', 'B')
  await a.saveFile('same.md', 'A')
  await a.patchTaskList('/worktrees/a & b', [], 'owner@example.com')
  await a.switchWorkspace('/projects/next')
  finishRead(Response.json({ path: 'same.md', content: 'A', editable: true }))
  assert.equal((await pending).content, 'A')
  const roots = requests.map(({ url }) => url.searchParams.get('mewWorkspacePath'))
  assert.deepEqual(roots, ['/worktrees/a & b', '/projects/b', '/worktrees/a & b', '/worktrees/a & b', '/worktrees/a & b'])
  assert.equal(requests[0].url.searchParams.get('project'), '.workspace')
  assert.equal(JSON.parse(requests[1].init!.body as string).project, 'other')
  assert.equal(JSON.parse(requests[2].init!.body as string).project, '.workspace')
  assert.equal(new Headers(requests[3].init!.headers).get('X-Mew-Task-Owner'), 'owner%40example.com')
  assert.equal(requests[4].url.pathname, '/api/workspace')
  assert.equal(JSON.parse(requests[4].init!.body as string).path, '/projects/next')
  a.rawUrl('same.md'); a.downloadUrl('same.md'); await a.prepareResourceUrl('/api/asset?path=photo.png')
  a.openSocket('wss://device.test/api/presence/ws')
  for (const input of [...resources, ...sockets]) {
    const url = new URL(input, 'https://device.test')
    assert.equal(url.searchParams.get('mewWorkspacePath'), '/worktrees/a & b')
    assert.equal(url.searchParams.get('mewProjectPath'), '/projects/a')
  }
  assert.equal(a.resourceUrl('https://external.test/api/photo'), 'https://external.test/api/photo')
  assert.equal(a.resourceUrl('data:image/png;base64,AA=='), 'data:image/png;base64,AA==')
  assert.throws(() => a.resourceUrl('/api/raw?mewWorkspacePath=/other'), /범위/)
})

test('project action archive download retains project and workspace scope through resource mapping', async t => {
  installGlobals(t)
  const api = await fixture()
  const mapped: string[] = []
  api.configureAppRuntime({ resourceUrl(url) { mapped.push(url); return url } })
  const client = api.createWorkspaceClient({ workspacePath: '/worktrees/a', projectPath: '/projects/a' })
  const archiveUrl = Reflect.get(client, 'projectActionArchiveUrl')
  assert.equal(typeof archiveUrl, 'function')
  const url = new URL(archiveUrl('.workspace', 'run id', 'apps/mobile', '/worktrees/a'), 'https://device.test')
  assert.equal(url.pathname, '/api/project-actions/archive')
  assert.equal(url.searchParams.get('project'), '.workspace')
  assert.equal(url.searchParams.get('path'), 'apps/mobile')
  assert.equal(url.searchParams.get('workspacePath'), '/worktrees/a')
  assert.equal(url.searchParams.get('runId'), 'run id')
  assert.equal(url.searchParams.get('mewWorkspacePath'), '/worktrees/a')
  assert.equal(url.searchParams.get('mewProjectPath'), '/projects/a')
  assert.equal(mapped.length, 1)
})

test('available build artifact requests and downloads keep the selected project scope', async t => {
  installGlobals(t)
  const api = await fixture()
  const calls: URL[] = []
  api.configureAppRuntime({ transport: {
    fetch(input) { calls.push(new URL(String(input), 'https://device.test')); return Promise.resolve(Response.json({ artifacts: [] })) },
    socket() { throw new Error('No socket expected') }, close() {},
  } })
  const client = api.createWorkspaceClient({ workspacePath: '/worktrees/a', projectPath: '/projects/a' })
  await client.fetchAvailableProjectArtifacts('.workspace', 'apps/mobile', '/worktrees/a')
  const download = new URL(client.availableProjectArtifactUrl('.workspace', 'build/app-debug.apk', 'apps/mobile', '/worktrees/a'), 'https://device.test')
  assert.equal(calls[0].pathname, '/api/project-actions/available-artifacts')
  assert.equal(download.pathname, '/api/project-actions/available-artifact')
  assert.equal(download.searchParams.get('artifactPath'), 'build/app-debug.apk')
  for (const url of [calls[0], download]) {
    assert.equal(url.searchParams.get('project'), '.workspace')
    assert.equal(url.searchParams.get('path'), 'apps/mobile')
    assert.equal(url.searchParams.get('workspacePath'), '/worktrees/a')
    assert.equal(url.searchParams.get('mewWorkspacePath'), '/worktrees/a')
    assert.equal(url.searchParams.get('mewProjectPath'), '/projects/a')
  }
})

test('delivery API calls retain their original workspace and do not dispatch work on reads or saves', async t => {
  installGlobals(t)
  const api = await fixture()
  const calls: { url: URL; init?: RequestInit }[] = []
  api.configureAppRuntime({ transport: {
    fetch(input, init) { calls.push({ url: new URL(String(input), 'https://device.test'), init }); return Promise.resolve(Response.json({})) },
    socket() { throw new Error('No socket expected') }, close() {},
  } })
  const client = api.createWorkspaceClient({ workspacePath: '/original', projectPath: '/original' })
  const invoke = async (name: string, ...args: unknown[]) => {
    const method = Reflect.get(client, name)
    assert.equal(typeof method, 'function', name)
    return method(...args)
  }
  await invoke('fetchProjectPipelines', '.workspace', 'app', '/original')
  await invoke('saveProjectPipelines', '.workspace', [], 'app', '/original')
  await invoke('runProjectPipeline', '.workspace', 'publish', 'app', '/original', 'reviewed-revision')
  await invoke('fetchReleaseProviders', '.workspace', 'app', '/original')
  await invoke('saveReleaseConnection', '.workspace', { config: { provider: 'cloudflare-pages', label: 'Website', accountId: 'a', projectName: 'site', branch: 'main' }, token: 'fixture-token' }, 'app', '/original')
  await invoke('removeReleaseConnection', '.workspace', 'connection', 'app', '/original')
  await invoke('refreshReleaseProvider', '.workspace', 'run', 'app', '/original')
  assert.deepEqual(calls.map(({ url, init }) => [url.pathname, init?.method ?? 'GET']), [
    ['/api/project-pipelines', 'GET'], ['/api/project-pipelines', 'PUT'], ['/api/project-pipelines/run', 'POST'],
    ['/api/release-providers', 'GET'], ['/api/release-providers/connection', 'PUT'],
    ['/api/release-providers/connection/connection', 'DELETE'], ['/api/release-providers/refresh', 'POST'],
  ])
  assert.equal(JSON.parse(String(calls[2].init?.body)).expectedRevision, 'reviewed-revision')
  for (const { url, init } of calls) {
    assert.equal(url.searchParams.get('mewWorkspacePath'), '/original')
    assert.equal(url.searchParams.get('mewProjectPath'), '/original')
    const scope = init?.body ? JSON.parse(String(init.body)) : Object.fromEntries(url.searchParams)
    assert.equal(scope.project, '.workspace')
    assert.equal(scope.path, 'app')
    assert.equal(scope.workspacePath, '/original')
  }
})

test('explicit workspace reads require advertised scope support while accepting canonical server paths', async t => {
  installGlobals(t)
  const api = await fixture()
  let response: unknown = { path: '/selected-account-root', projectPath: '/selected-account-root' }
  api.configureAppRuntime({ transport: {
    async fetch() { return Response.json(response) },
    socket() { throw new Error('Unexpected socket') }, close() {},
  } })
  const scoped = api.createWorkspaceClient({ workspacePath: '/registered/symlink', projectPath: '/registered/symlink' })
  await assert.rejects(scoped.fetchWorkspace(), /지원하지 않습니다/)
  assert.equal((await api.workspaceClient.fetchWorkspace()).path, '/selected-account-root', 'an older server retains its existing single-project adapter')
  response = { workspaceScopeVersion: 2, path: '/registered/symlink', projectPath: '/registered/symlink' }
  await assert.rejects(scoped.fetchWorkspace(), /지원하지 않습니다/)
  response = { workspaceScopeVersion: 1, path: '' }
  await assert.rejects(scoped.fetchWorkspace(), /올바른 프로젝트 범위/)
  response = { workspaceScopeVersion: 1, path: '/canonical/project', projectPath: '/canonical/project' }
  assert.equal((await scoped.fetchWorkspace()).path, '/canonical/project', 'the versioned resolver may canonicalize a registered symlink before the host rebinds its client')
  response = { path: '/destination', projectPath: '/destination' }
  await assert.rejects(scoped.switchWorkspace('/destination'), /지원하지 않습니다/)
})

test('Git authentication continuation retries its captured workspace after another panel is focused', async t => {
  installGlobals(t)
  const api = await fixture()
  const urls: URL[] = []
  let finishLogin!: (connected: boolean) => void
  const target = globalThis.window
  target.addEventListener('mew:git-login-required', event => {
    event.preventDefault()
    finishLogin = (event as CustomEvent<{ finish(connected: boolean): void }>).detail.finish
  })
  api.configureAppRuntime({ transport: {
    async fetch(input) {
      urls.push(new URL(String(input), 'https://device.test'))
      return urls.length === 1
        ? Response.json({ code: 'git-auth-required', owner: 'owner@example.com', workspace: '/a' }, { status: 428 })
        : Response.json({ ok: true })
    }, socket() { throw new Error('Unexpected socket') }, close() {},
  } })
  const a = api.createWorkspaceClient({ workspacePath: '/a', projectPath: '/a' })
  const b = api.createWorkspaceClient({ workspacePath: '/b', projectPath: '/b' })
  const save = a.saveFile('note.md', 'A')
  while (!finishLogin) await new Promise(resolve => setImmediate(resolve))
  b.setProject('focused')
  api.workspaceClient.setProject('focused')
  finishLogin(true)
  await save
  assert.deepEqual(urls.map(url => url.searchParams.get('mewWorkspacePath')), ['/a', '/a'])
})

test('ancillary editor, agent, drawing and debugger APIs use the same fixed client scope', async t => {
  installGlobals(t)
  const api = await fixture()
  const requests: { url: URL; init?: RequestInit }[] = []
  api.configureAppRuntime({ transport: {
    async fetch(input, init) { requests.push({ url: new URL(String(input), 'https://device.test'), init }); return Response.json({ commands: [], drawings: [] }) },
    socket() { throw new Error('Unexpected socket') }, close() {},
  } })
  const client = api.createWorkspaceClient({ workspacePath: '/worktree', projectPath: '/logical' })
  await client.fetchAccountEditorTabs('/worktree')
  await client.fetchHarness('/worktree', 'mcp')
  await client.listAgentCommands({ runtime: 'codex', cwd: '/worktree', sessionId: 's' })
  await client.drawingStorage.getDrawingScope('/worktree')
  await client.debuggerRequest('/worktree')
  assert.equal(new Headers(requests.at(-1)!.init!.headers).get('X-Mew-Debug-Workspace'), '%2Fworktree')
  await client.fetchProjectSetup()
  await client.fetchSkillLibrary('/worktree')
  await client.fetchMcpManagement('/worktree')
  assert.deepEqual(requests.map(request => request.url.pathname), ['/api/user-ui/editor-tabs', '/api/agent/harness', '/api/agent/commands', '/api/agent/drawings', '/api/debugger', '/api/docs/agent-context', '/api/agent/skill-library', '/api/agent/mcp-management'])
  for (const { url } of requests) {
    assert.equal(url.searchParams.get('mewWorkspacePath'), '/worktree')
    assert.equal(url.searchParams.get('mewProjectPath'), '/logical')
  }
  assert.equal(new URL(client.agentCommandArchiveUrl('command'), 'https://device.test').searchParams.get('mewWorkspacePath'), '/worktree')
})

test('runtime installation polls a scoped background attempt beyond a normal request deadline', async t => {
  installGlobals(t)
  const api = await fixture()
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const client = api.createWorkspaceClient({ workspacePath: '/worktree', projectPath: '/logical' })
  const requests: { method: string; url: URL }[] = []
  const running = { id: 'opencode', installed: false, installing: true }
  const complete = { status: { ...running, installed: true, installing: false }, output: 'fixture installed' }
  let polls = 0
  let legacy = false
  api.configureAppRuntime({ transport: {
    async fetch(input, init) {
      const url = new URL(String(input), 'https://device.test')
      const method = init?.method ?? 'GET'
      requests.push({ method, url })
      if (method === 'POST') return legacy ? Response.json(complete) : Response.json({ status: running, output: '', attempt: 'fixture-attempt' }, { status: 202 })
      polls++
      if (polls === 1) return Response.json({ status: running, output: '' })
      if (polls === 2) throw new TypeError('fixture connection interrupted')
      return Response.json(complete)
    },
    socket() { throw new Error('Unexpected socket') }, close() {},
  } })

  const pending = client.installAgentRuntime('opencode')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(polls, 1)
  t.mock.timers.tick(31_000)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(polls, 2)
  t.mock.timers.tick(1000)
  assert.deepEqual(await pending, complete)
  assert.deepEqual(requests.map(row => row.method), ['POST', 'GET', 'GET', 'GET'])
  assert.equal(requests[0].url.searchParams.get('background'), '1')
  for (const { method, url } of requests) {
    assert.equal(url.pathname, '/api/agent-runtimes/opencode/install')
    assert.equal(url.searchParams.get('mewWorkspacePath'), '/worktree')
    assert.equal(url.searchParams.get('mewProjectPath'), '/logical')
    if (method === 'GET') assert.equal(url.searchParams.get('attempt'), 'fixture-attempt')
  }

  legacy = true
  assert.deepEqual(await client.installAgentRuntime('opencode'), complete)
  assert.equal(polls, 3, 'a legacy response does not require polling')
})

test('background installation preserves provider errors and bounds a stalled status request', async t => {
  installGlobals(t)
  const api = await fixture()
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let stall = false
  let pollSignal: AbortSignal | undefined
  api.configureAppRuntime({ transport: {
    async fetch(_input, init) {
      if (init?.method === 'POST') return Response.json({ status: { installing: true }, output: '', attempt: 'fixture-attempt' }, { status: 202 })
      if (!stall) return Response.json({ error: 'fixture install failed' }, { status: 400 })
      pollSignal = init?.signal ?? undefined
      return new Promise((_resolve, reject) => pollSignal?.addEventListener('abort', () => reject(pollSignal?.reason), { once: true }))
    },
    socket() { throw new Error('Unexpected socket') }, close() {},
  } })
  await assert.rejects(api.workspaceClient.installAgentRuntime('opencode'), /fixture install failed/)
  stall = true
  const pending = api.workspaceClient.installAgentRuntime('opencode')
  const rejected = assert.rejects(pending, /installation status|설치 상태/)
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(pollSignal)
  t.mock.timers.tick(610_000)
  await rejected
  assert.equal(pollSignal.aborted, true)
})

test('DB subscriptions share a root connection and close after the final consumer without crossing roots', async t => {
  installGlobals(t)
  const api = await fixture()
  type Socket = { url: URL; readyState: number; close(): void; closed: boolean; send(data: string): void; messages: string[]; onopen?(): void; onmessage?(event: { data: string }): void }
  const sockets: Socket[] = []
  api.configureAppRuntime({ transport: {
    async fetch() { return Response.json({}) }, close() {},
    socket(input) {
      const socket: Socket = { url: new URL(input), readyState: 0, closed: false, messages: [], send(data) { this.messages.push(data) }, close() { this.closed = true } }
      sockets.push(socket)
      return socket as unknown as WebSocket
    },
  } })
  const a = api.createWorkspaceClient({ workspacePath: '/a', projectPath: '/a' })
  const a2 = api.createWorkspaceClient({ workspacePath: '/a', projectPath: '/a' })
  const b = api.createWorkspaceClient({ workspacePath: '/b', projectPath: '/b' })
  const received: string[] = []
  const offA = a.createEditorApi('.workspace').db!.subscribe('same', () => { received.push('a') })
  const offA2 = a2.createEditorApi('.workspace').db!.subscribe('same', () => { received.push('a2') })
  const offB = b.createEditorApi('.workspace').db!.subscribe('same', () => { received.push('b') })
  assert.equal(sockets.length, 2)
  for (const socket of sockets) { socket.readyState = 1; socket.onopen?.() }
  assert.equal(sockets[0].messages.length, 1)
  assert.deepEqual(sockets.map(socket => socket.url.searchParams.get('mewWorkspacePath')), ['/a', '/b'])
  sockets[0].onmessage?.({ data: JSON.stringify({ type: 'db.event', project: '.workspace', dbId: 'same', event: { type: 'title', title: 'Only A' } }) })
  assert.deepEqual(received, ['a', 'a2'])
  offA(); assert.equal(sockets[0].closed, false)
  offA2(); assert.equal(sockets[0].closed, true)
  assert.equal(sockets[1].closed, false)
  offB(); assert.equal(sockets[1].closed, true)
})

test('live Git resources multiplex only within their captured root and release socket subscriptions', async t => {
  installGlobals(t)
  const api = await fixture()
  type Socket = { readyState: number; closed: boolean; messages: string[]; close(): void; send(data: string): void; onopen?(): void; onmessage?(event: { data: string }): void }
  const sockets: Socket[] = [], urls: URL[] = []
  api.configureAppRuntime({ transport: {
    async fetch() { return Response.json({}) }, close() {},
    socket(input) {
      urls.push(new URL(input))
      const socket: Socket = { readyState: 0, closed: false, messages: [], close() { this.closed = true }, send(data) { this.messages.push(data) } }
      sockets.push(socket)
      return socket as unknown as WebSocket
    },
  } })
  const a = api.createWorkspaceClient({ workspacePath: '/a', projectPath: '/a' })
  const a2 = api.createWorkspaceClient({ workspacePath: '/a', projectPath: '/a' })
  const b = api.createWorkspaceClient({ workspacePath: '/b', projectPath: '/b' })
  const seen: string[] = [], resource = { kind: 'git' as const, project: '.workspace', path: '' }
  const offA = a.subscribeLive(resource, () => { seen.push('a') })
  const offA2 = a2.subscribeLive(resource, () => { seen.push('a2') })
  const offB = b.subscribeLive(resource, () => { seen.push('b') })
  assert.equal(sockets.length, 2)
  for (const socket of sockets) { socket.readyState = 1; socket.onopen?.() }
  assert.equal(sockets[0].messages.length, 1)
  assert.deepEqual(urls.map(url => url.searchParams.get('mewWorkspacePath')), ['/a', '/b'])
  const id = JSON.parse(sockets[0].messages[0]).id
  sockets[0].onmessage?.({ data: JSON.stringify({ type: 'snapshot', id, revision: 1, value: { files: ['a.md'] } }) })
  assert.deepEqual(seen, ['a', 'a2'])
  offA(); assert.equal(sockets[0].closed, false)
  offA2(); assert.equal(sockets[0].closed, true)
  assert.equal(sockets[1].closed, false)
  offB(); assert.equal(sockets[1].closed, true)
})
