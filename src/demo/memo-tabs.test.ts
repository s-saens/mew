import assert from 'node:assert/strict'
import test from 'node:test'
import { demoFetch } from './transport.ts'
import { DemoWorkspaceStore } from './workspace-store.ts'
import { createDemoCollaboration } from './collaboration.ts'
import { PRIVATE_MEMO_PROJECT, privateMemoPath, SHARED_MEMO_PATH, SHARED_MEMO_PROJECT } from '../../shared/shared-memo.ts'
import type { CollaborationSession } from '../runtime/app-runtime.ts'

test('demo memo tabs use visitor memory and independent CRDT documents across projects', async () => {
  const store = new DemoWorkspaceStore(), other = new DemoWorkspaceStore(), provider = createDemoCollaboration(store)
  try {
    const response = await demoFetch(store, '/api/memo-tabs', { method: 'POST' })
    assert.equal(response.status, 201)
    const { tab } = await response.json()
    const { tabs, ownerId } = await (await demoFetch(store, '/api/memo-tabs')).json()
    assert.deepEqual(tabs, [tab])
    assert.deepEqual((await (await demoFetch(other, '/api/memo-tabs')).json()).tabs, [])
    let privateDoc: CollaborationSession | undefined, shared: CollaborationSession | undefined, reopened: CollaborationSession | undefined
    const identity = { project: PRIVATE_MEMO_PROJECT, path: privateMemoPath(ownerId, tab.id), authEmail: ownerId }
    provider.open(identity, session => { privateDoc = session })
    provider.open({ project: SHARED_MEMO_PROJECT, path: SHARED_MEMO_PATH, authEmail: ownerId }, session => { shared = session })
    assert.ok(privateDoc?.synced)
    assert.ok(shared?.synced)
    assert.notEqual(privateDoc.ydoc, shared.ydoc)
    privateDoc.ydoc.getText('test').insert(0, 'Private')
    assert.equal(shared.ydoc.getText('test').toString(), '')
    store.openWorkspace(`${store.workspacePath}/docs`)
    provider.open(identity, session => { reopened = session })
    assert.equal(reopened?.ydoc, privateDoc.ydoc)
    assert.equal((await demoFetch(store, '/api/memo-tabs/shared', { method: 'DELETE' })).status, 404)
    assert.equal((await demoFetch(store, `/api/memo-tabs/${tab.id}`, { method: 'DELETE' })).status, 200)
    assert.deepEqual((await (await demoFetch(store, '/api/memo-tabs')).json()).tabs, [])
    store.reset()
    assert.deepEqual((await (await demoFetch(store, '/api/memo-tabs')).json()).tabs, [])
  } finally { provider.close(); store.close(); other.close() }
})
