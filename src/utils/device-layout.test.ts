import test from 'node:test'
import assert from 'node:assert/strict'
import { restoreDeviceLayout, saveDeviceLayout } from './device-layout.ts'

test('devices restore independent geometry without copying unrelated account settings', () => {
  const desktop = new Map<string, string>(), mobile = new Map<string, string>()
  const attach = (storage: Map<string, string>) => Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } })
  const fallback = { dock: { ratio: .5 }, tabs: { main: 1 }, features: { expanded: true } }
  attach(desktop)
  saveDeviceLayout('a', '/project', { dock: { ratio: .3 }, tabs: { main: 2 }, features: { expanded: false } })
  assert.deepEqual(restoreDeviceLayout('a', '/project', fallback), { ...fallback, dock: { ratio: .3 } })
  assert.equal(JSON.parse([...desktop.values()][0]).tabs, undefined, 'tab metadata is no longer saved as device geometry')
  desktop.set([...desktop.keys()][0], JSON.stringify({ dock: { ratio: .3 }, tabs: { stale: true } }))
  assert.deepEqual(restoreDeviceLayout('a', '/project', fallback).tabs, fallback.tabs, 'old device tabs cannot override the account')
  assert.deepEqual(restoreDeviceLayout('b', '/project', fallback), fallback)
  attach(mobile)
  assert.deepEqual(restoreDeviceLayout('a', '/project', fallback), fallback)
  saveDeviceLayout('a', '/project', { dock: { ratio: .7 } })
  attach(desktop)
  assert.deepEqual(restoreDeviceLayout('a', '/project', fallback).dock, { ratio: .3 })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } } })
  assert.deepEqual(restoreDeviceLayout('a', '/project', fallback), fallback)
  assert.doesNotThrow(() => saveDeviceLayout('a', '/project', fallback))
})

const attachStorage = () => {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } })
  return values
}

test('desktop layout migrates the active project once and rejects stale prefetched project geometry', async () => {
  const { createDeviceLayoutSession } = await import('./device-layout.ts')
  const storage = attachStorage()
  saveDeviceLayout('a', '/first', { dock: { ratio: .3 }, chrome: { agentOpen: true } }, false)
  saveDeviceLayout('a', '/second', { dock: { ratio: .8 }, chrome: { agentOpen: false } }, false)
  const session = createDeviceLayoutSession('a')
  const first = session.restore('/first', { tabs: { first: true } }, true)
  assert.deepEqual(first.dock, { ratio: .3 })
  assert.deepEqual(first.chrome, { agentOpen: true })
  const current = { dock: { ratio: .4 }, chrome: { agentOpen: true, gitOpen: true } }
  session.save('/first', current, true)
  const prefetched = { dock: { ratio: .9 }, chrome: { agentOpen: false }, tabs: { second: true }, trees: { second: true } }
  assert.deepEqual(session.restore('/second', prefetched, true), { ...prefetched, ...current })
  assert.deepEqual(session.pending({}, true), current, 'uncached switches retain current desktop geometry while loading')
  assert.deepEqual(createDeviceLayoutSession('a').restore('/second', prefetched, true), { ...prefetched, ...current }, 'refresh restores account geometry regardless of project')
  assert.deepEqual(createDeviceLayoutSession('b').restore('/second', prefetched, true).dock, { ratio: .9 }, 'another account retains its own initial geometry')
  assert.equal(JSON.parse(storage.get('mew:device-layout:a:desktop')!).tabs, undefined)
  assert.deepEqual(session.restore('/second', prefetched, false).dock, { ratio: .8 }, 'mobile retains per-project geometry')
  session.save('/second', { dock: { ratio: .7 } }, false)
  assert.deepEqual(session.restore('/first', {}, true).dock, { ratio: .4 }, 'mobile cannot overwrite desktop geometry')
})

test('accepted account geometry survives blocked storage and empty initial layouts', async () => {
  const { createDeviceLayoutSession } = await import('./device-layout.ts')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } } })
  const session = createDeviceLayoutSession('a')
  assert.deepEqual(session.restore('/first', {}, true), { dock: null, chrome: null })
  assert.deepEqual(session.restore('/second', { dock: { foreign: true }, tabs: { second: true } }, true), { dock: null, chrome: null, tabs: { second: true } })
  session.save('/second', { dock: { ratio: .2 }, chrome: { tasksOpen: true } }, true)
  assert.deepEqual(session.restore('/third', { dock: { ratio: .9 } }, true), { dock: { ratio: .2 }, chrome: { tasksOpen: true } })
})
