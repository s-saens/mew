import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ProjectRegistry } from './project-registry.ts'

test('catalog snapshot returns account-specific registered projects without waiting for filesystem discovery', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-catalog-snapshot-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const project = path.join(dir, 'project'), child = path.join(project, 'child')
  fs.mkdirSync(path.join(child, '.mew'), { recursive: true })
  const store = new ProjectRegistry(path.join(dir, 'data'), path.join(dir, 'managed'))
  store.link('a@example.test', project)
  const original = fs.promises.readdir.bind(fs.promises)
  let release!: () => void, started!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  const entered = new Promise<void>(resolve => { started = resolve })
  t.mock.method(fs.promises, 'readdir', async (directory: fs.PathLike, options: { withFileTypes: true }) => {
    if (directory === project) { started(); await held }
    return original(directory, options)
  })
  try {
    const full = store.listAsync('a@example.test')
    await entered
    assert.deepEqual(store.snapshot('a@example.test').map(p => [p.path, p.mine, p.icon]), [[project, true, null]])
    assert.equal(store.snapshot('b@example.test')[0].mine, false)
    release()
    assert.deepEqual((await full).map(p => p.path), [project, child])
    assert.equal(store.snapshot('a@example.test')[1].parentPath, project)
  } finally { release() }
})

test('canceling a catalog request stops its scan once no other caller needs it', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-catalog-cancel-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const root = path.join(dir, 'project'), child = path.join(root, 'child')
  fs.mkdirSync(path.join(child, '.mew'), { recursive: true })
  const store = new ProjectRegistry(path.join(dir, 'data'), path.join(dir, 'managed'))
  store.link('a@example.test', root)
  const original = fs.promises.readdir.bind(fs.promises)
  let release!: () => void, started!: () => void, childReads = 0
  const held = new Promise<void>(resolve => { release = resolve })
  const entered = new Promise<void>(resolve => { started = resolve })
  t.mock.method(fs.promises, 'readdir', async (directory: fs.PathLike, options: { withFileTypes: true }) => {
    if (directory === root) { started(); await held }
    if (directory === child) childReads++
    return original(directory, options)
  })
  const controller = new AbortController()
  try {
    const pending = store.listAsync('a@example.test', controller.signal)
    await entered
    controller.abort()
    await assert.rejects(pending, { name: 'AbortError' })
    release()
    await new Promise(resolve => setTimeout(resolve, 30))
    assert.equal(childReads, 0, 'canceled scan must not continue into the selected project')
    assert.deepEqual(store.snapshot('a@example.test').map(p => p.path), [root])
  } finally { release() }
})

test('canceling one catalog request does not stop discovery for another account', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-catalog-shared-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const root = path.join(dir, 'project'), child = path.join(root, 'child')
  fs.mkdirSync(path.join(child, '.mew'), { recursive: true })
  const store = new ProjectRegistry(path.join(dir, 'data'), path.join(dir, 'managed'))
  store.link('a@example.test', root)
  const original = fs.promises.readdir.bind(fs.promises)
  let release!: () => void, started!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  const entered = new Promise<void>(resolve => { started = resolve })
  t.mock.method(fs.promises, 'readdir', async (directory: fs.PathLike, options: { withFileTypes: true }) => {
    if (directory === root) { started(); await held }
    return original(directory, options)
  })
  const controller = new AbortController()
  try {
    const first = store.listAsync('a@example.test', controller.signal)
    const second = store.listAsync('b@example.test')
    await entered
    controller.abort()
    await assert.rejects(first, { name: 'AbortError' })
    release()
    assert.deepEqual((await second).map(p => p.path), [root, child])
  } finally { release() }
})
