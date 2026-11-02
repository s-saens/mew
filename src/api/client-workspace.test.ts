import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'rolldown'

test('only an explicit initial workspace read requests the optional UI snapshot', async t => {
  const values = { localStorage: { getItem: () => null }, location: { pathname: '/' } }
  for (const [key, value] of Object.entries(values)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { value, configurable: true })
    t.after(() => { if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key) })
  }
  const client = new URL('./client.ts', import.meta.url).pathname
  const transport = new URL('../utils/remote-transport.ts', import.meta.url).pathname
  const bundle = await build({
    input: 'virtual:workspace-client', write: false, platform: 'browser', output: { format: 'esm' },
    plugins: [{ name: 'workspace-client-fixture', resolveId: id => id === 'virtual:workspace-client' ? id : undefined,
      load: id => id === 'virtual:workspace-client' ? `export { fetchWorkspace } from ${JSON.stringify(client)}; export { setRemoteTransport } from ${JSON.stringify(transport)};` : undefined }],
  })
  assert.equal(bundle.output.length, 1)
  const chunk = bundle.output.find(item => item.type === 'chunk')!
  const api = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`) as {
    fetchWorkspace(options?: { includeUi?: boolean }): Promise<unknown>
    setRemoteTransport(transport: { fetch(input: unknown): Promise<Response>; socket(): never; close(): void }): void
  }
  const urls: string[] = []
  let response: unknown = { path: '/project', projects: [], docs: 'docs', docsPath: '/project/docs' }
  api.setRemoteTransport({ async fetch(input) { urls.push(String(input)); return Response.json(response) }, socket() { throw new Error('Unexpected socket') }, close() {} })
  assert.deepEqual(await api.fetchWorkspace(), response)
  assert.equal(urls.at(-1), '/api/workspace')
  assert.deepEqual(await api.fetchWorkspace({ includeUi: true }), response, 'an older host may omit the optional snapshot')
  assert.equal(urls.at(-1), '/api/workspace?include=workspace-ui')
  response = { ...response as object, workspaceUi: { workspacePath: '/project', state: null } }
  assert.deepEqual(await api.fetchWorkspace({ includeUi: true }), response)
  await api.fetchWorkspace({ includeUi: false })
  assert.equal(urls.at(-1), '/api/workspace')
})
