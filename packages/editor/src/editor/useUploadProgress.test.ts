import test from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { useUploadProgress } from './useUploadProgress.ts'
import type { EditorApi } from '../types.ts'

const win = new Window({ url: 'http://localhost' })
for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement']) {
  if (!(key in globalThis)) Object.defineProperty(globalThis, key, { configurable: true, value: (win as unknown as Record<string, unknown>)[key] })
}
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })

test('tracks concurrent files independently and removes only the settled upload', async t => {
  const requests: { progress: (value: number) => void; resolve: () => void; reject: () => void }[] = []
  const api = { uploadAsset: (_file: File, progress: (value: number) => void) => new Promise((resolve, reject) => {
    requests.push({ progress, resolve: () => resolve({ url: '/asset', name: 'saved', mimetype: '' }), reject: () => reject(new Error('failed')) })
  }) } as EditorApi
  let current: ReturnType<typeof useUploadProgress>
  function Fixture() { current = useUploadProgress(api); return null }
  const element = win.document.createElement('div')
  const root = createRoot(element)
  await React.act(async () => root.render(React.createElement(Fixture)))
  t.after(async () => { await React.act(async () => root.unmount()); element.remove() })
  let first!: Promise<unknown>, second!: Promise<unknown>
  const forwarded: number[] = []
  await React.act(async () => {
    first = current.trackedApi.uploadAsset(new File(['x'], 'photo.png'), value => forwarded.push(value))
    second = current.trackedApi.uploadAsset(new File(['y'], 'voice.webm'))
  })
  assert.deepEqual(current!.uploads.map(({ name, percent }) => [name, percent]), [['photo.png', 0], ['voice.webm', 0]])
  await React.act(async () => { requests[0].progress(37.9); requests[1].progress(81) })
  assert.deepEqual(current!.uploads.map(({ percent }) => percent), [37, 81])
  assert.deepEqual(forwarded, [37])
  await React.act(async () => { requests[0].resolve(); await first })
  assert.deepEqual(current!.uploads.map(({ name, percent }) => [name, percent]), [['voice.webm', 81]])
  await React.act(async () => { requests[1].reject(); await assert.rejects(second, /failed/) })
  assert.deepEqual(current!.uploads, [])
})

test('a captured upload keeps its original API when the editor changes projects', async t => {
  const used: string[] = []
  const makeApi = (project: string) => ({ uploadAsset: async () => {
    used.push(project)
    return { url: '/asset', name: 'saved', mimetype: '' }
  } }) as EditorApi
  const firstApi = makeApi('first'), secondApi = makeApi('second')
  let current: ReturnType<typeof useUploadProgress>
  function Fixture({ api }: { api: EditorApi }) { current = useUploadProgress(api); return null }
  const element = win.document.createElement('div')
  const root = createRoot(element)
  await React.act(async () => root.render(React.createElement(Fixture, { api: firstApi })))
  t.after(async () => { await React.act(async () => root.unmount()); element.remove() })
  const captured = current!.trackedApi.uploadAsset
  await React.act(async () => root.render(React.createElement(Fixture, { api: secondApi })))
  await React.act(async () => { await captured(new File(['x'], 'drawing.png')) })
  assert.deepEqual(used, ['first'])
})
