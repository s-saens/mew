import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { launchNativeEngine } from './native-engines.mjs'

async function fixture(t, { failPage = false, crash = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'mew-native-engine-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const binary = join(root, 'engine.mjs')
  await writeFile(binary, `#!/usr/bin/env node
import { createServer } from 'node:http'
const args = process.argv.slice(2)
${crash ? "process.stderr.write('private startup output\\n'); process.exit(7)" : ''}
const port = Number(args[args.indexOf('--port') + 1])
const host = args[args.indexOf('--host') + 1]
createServer((request, response) => {
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify({ webSocketDebuggerUrl: 'ws://127.0.0.1:' + port, args, host, pid: process.pid }))
}).listen(port, host)
`)
  await chmod(binary, 0o700)
  const playwrightPath = join(root, 'playwright.mjs')
  await writeFile(playwrightPath, `
export let observedPid
export const chromium = {
  async connectOverCDP(endpoint) {
    const metadata = await (await fetch(endpoint + '/json/version')).json()
    observedPid = metadata.pid
    const context = {
      pages: () => metadata.args.includes('--load-resources') ? [{ startupPlaceholder: true }] : [],
      newPage: async () => {
      ${failPage ? "throw new Error('Page initialization failed')" : 'return { metadata }'}
    } }
    return { contexts: () => [context], close: async () => {} }
  }
}
`)
  return { root, profileDir: join(root, 'profile'), runtime: { moli: binary, obscura: binary, lightpanda: binary, playwrightPath } }
}

function processExists(pid) {
  try { process.kill(pid, 0); return true } catch (error) {
    if (error.code === 'ESRCH') return false
    throw error
  }
}

for (const id of ['moli', 'obscura', 'lightpanda']) {
  test(`${id} owns its listener, enables resources, and cleans up on close`, async t => {
    const { runtime, profileDir } = await fixture(t)
    const result = await launchNativeEngine(id, runtime, profileDir)
    t.after(result.close)
    const { args, host, pid } = result.page.metadata
    assert.equal(host, '127.0.0.1')
    assert.ok(Number(args[args.indexOf('--port') + 1]) > 0)
    assert.equal(args.includes('--stealth'), false)
    assert.equal(args.includes('--user-agent'), false)
    if (id === 'moli') {
      assert.ok(args.includes('--layout'))
      assert.ok(args.includes('--resource'))
      assert.equal(args[args.indexOf('--profile-dir') + 1], profileDir)
    } else if (id === 'obscura') {
      assert.ok(args.includes('--allow-private-network'))
      assert.equal(args[args.indexOf('--storage-dir') + 1], profileDir)
    } else {
      for (const resource of ['iframe', 'image', 'stylesheet', 'worker']) assert.ok(args.includes(resource))
    }
    assert.equal(result.canScreenshot, id !== 'lightpanda')
    assert.equal(result.canPointer, id !== 'lightpanda')
    assert.equal(result.screenshotType, id === 'lightpanda' ? null : 'png')
    assert.ok(processExists(pid))
    await Promise.all([result.close(), result.close()])
    assert.equal(processExists(pid), false)
  })
}

test('page initialization failure terminates the owned engine', async t => {
  const { runtime, profileDir } = await fixture(t, { failPage: true })
  await assert.rejects(launchNativeEngine('moli', runtime, profileDir), /Page initialization failed/)
  const { observedPid } = await import(pathToFileURL(runtime.playwrightPath).href)
  assert.ok(observedPid)
  assert.equal(processExists(observedPid), false)
})

test('early startup failure reports its status without exposing process output', async t => {
  const { runtime, profileDir } = await fixture(t, { crash: true })
  await assert.rejects(launchNativeEngine('obscura', runtime, profileDir), error => {
    assert.match(error.message, /exited \(7\)/)
    assert.equal(error.message.includes('private startup output'), false)
    return true
  })
})

test('invalid runtime paths and engine names fail before spawning', async () => {
  await assert.rejects(launchNativeEngine('unknown', {}, '/tmp/profile'), /Unsupported native browser/)
  await assert.rejects(launchNativeEngine('moli', { moli: 'moli' }, '/tmp/profile'), /absolute executable path/)
  await assert.rejects(launchNativeEngine('moli', { moli: '/unused' }, 'profile'), /profile directory must be absolute/)
})
