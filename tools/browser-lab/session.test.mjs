import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { access, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { BrowserSession } from './session.mjs'

const INITIAL = 'https://example.test/initial'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function fakeEngine(overrides = {}) {
  const page = new EventEmitter()
  const visits = []
  const viewports = []
  let url = 'about:blank'
  let closes = 0
  const png = Buffer.alloc(24)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png)
  png.writeUInt32BE(1280, 16)
  png.writeUInt32BE(800, 20)
  Object.assign(page, {
    setDefaultTimeout() {},
    async setViewportSize(value) { viewports.push(value) },
    async goto(value) { visits.push(value); url = value },
    url: () => url,
    title: async () => 'Synthetic browser page',
    screenshot: async () => png,
  }, overrides)
  return {
    page, visits, viewports,
    canScreenshot: true, canPointer: true, screenshotType: 'png',
    get closes() { return closes },
    async close() { closes++ },
  }
}

test('concurrent startup callers wait for one factory and its initial navigation', { timeout: 5000 }, async t => {
  const factoryEntered = deferred()
  const factoryResult = deferred()
  const navigationEntered = deferred()
  const navigationResult = deferred()
  let factories = 0
  let navigations = 0
  const engine = fakeEngine({
    async goto(url) {
      navigations++
      assert.equal(url, INITIAL)
      navigationEntered.resolve()
      await navigationResult.promise
    },
  })
  const session = new BrowserSession({ id: 'moli', runtime: {}, initialUrl: INITIAL,
    factory: async () => { factories++; factoryEntered.resolve(); return factoryResult.promise } })
  t.after(async () => {
    factoryResult.resolve(engine)
    navigationResult.resolve()
    await session.close()
  })
  const first = session.ensureStarted()
  const second = session.ensureStarted()
  await factoryEntered.promise
  assert.equal(factories, 1)
  factoryResult.resolve(engine)
  await navigationEntered.promise
  let thirdSettled = false
  const third = session.ensureStarted().then(() => { thirdSettled = true })
  await setImmediate()
  assert.equal(thirdSettled, false, 'an assigned engine must not bypass its pending initial navigation')
  navigationResult.resolve()
  await Promise.all([first, second, third])
  assert.equal(factories, 1)
  assert.equal(navigations, 1)
  assert.equal(session.phase, 'ready')
})

test('a destroyed execution context during capture retries and publishes the next frame', { timeout: 5000 }, async t => {
  let titleReads = 0
  const engine = fakeEngine({
    async title() {
      titleReads++
      if (titleReads === 1) throw new Error('Execution context was destroyed, most likely because of a navigation')
      return 'Recovered page'
    },
  })
  const session = new BrowserSession({ id: 'moli', runtime: {}, initialUrl: INITIAL, factory: async () => engine })
  t.after(() => session.close())
  const captured = new Promise((resolve, reject) => {
    session.on('message', message => {
      if (message.type === 'frame') { session.setViewed(false); resolve(message) }
      if (message.type === 'state' && message.phase === 'error') reject(new Error(`Capture stopped: ${message.error}`))
    })
  })
  session.viewed = true
  const pumping = session.pump()
  const frame = await captured
  await pumping
  assert.equal(titleReads, 2)
  assert.equal(frame.width, 1280)
  assert.equal(frame.height, 800)
  assert.equal(session.captureBlocked, false)
  assert.equal(session.phase, 'ready')
  assert.equal(session.title, 'Recovered page')
  assert.equal(engine.closes, 0, 'a transient page navigation must not restart the engine')
})

test('a rejected resize preserves the effective viewport and the following resize can succeed', { timeout: 5000 }, async t => {
  const engine = fakeEngine({
    async setViewportSize({ width }) {
      if (width === 900) throw new Error('Viewport resize rejected')
    },
  })
  const session = new BrowserSession({ id: 'moli', runtime: {}, initialUrl: INITIAL, factory: async () => engine })
  t.after(() => session.close())
  await session.ensureStarted()
  await assert.rejects(session.enqueue({ type: 'resize', width: 900, height: 600 }), /Viewport resize rejected/)
  assert.equal(session.state().width, 1280)
  assert.equal(session.state().height, 800)
  await session.enqueue({ type: 'resize', width: 1024, height: 700 })
  assert.equal(session.state().width, 1024)
  assert.equal(session.state().height, 700)
})

test('restart closes the old engine and replaces its profile without carrying stored state', { timeout: 5000 }, async t => {
  const launches = []
  const session = new BrowserSession({ id: 'moli', runtime: {}, initialUrl: INITIAL,
    factory: async (_id, _runtime, profileDir) => {
      await access(profileDir)
      const engine = fakeEngine()
      launches.push({ engine, profileDir })
      return engine
    } })
  t.after(() => session.close())
  await session.ensureStarted()
  const old = launches[0]
  await writeFile(join(old.profileDir, 'session-marker'), 'synthetic fixture state')
  await session.enqueue({ type: 'navigate', url: 'https://example.test/current' })
  await session.enqueue({ type: 'restart' })
  assert.equal(launches.length, 2)
  const fresh = launches[1]
  assert.equal(old.engine.closes, 1)
  assert.equal(fresh.engine.closes, 0)
  assert.notEqual(old.profileDir, fresh.profileDir)
  await assert.rejects(access(old.profileDir), { code: 'ENOENT' })
  await access(fresh.profileDir)
  await assert.rejects(access(join(fresh.profileDir, 'session-marker')), { code: 'ENOENT' })
  assert.deepEqual(fresh.engine.visits, ['https://example.test/current'])
  await session.close()
  assert.equal(fresh.engine.closes, 1)
  await assert.rejects(access(fresh.profileDir), { code: 'ENOENT' })
})
