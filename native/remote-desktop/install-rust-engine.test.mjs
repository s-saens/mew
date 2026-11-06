import test from 'node:test'
import assert from 'node:assert/strict'
import { installRustEngine } from './install-rust-engine.mjs'

test('maintainer build timeout applies only to compilation and retains the ordinary installer default', () => {
  for (const buildTimeout of [undefined, 60 * 60_000]) {
    const calls = []
    installRustEngine({ target: '/fixture', platform: 'win32', buildTimeout,
      exists: () => true, copy() {}, rename() {}, remove() {}, mkdir() {}, prepareVendor() {}, log() {},
      run(command, args, options) { calls.push({ command, args, options }); return { status: 0 } },
    })
    assert.equal(calls.find(call => call.args[0] === 'build').options.timeout, buildTimeout ?? 20 * 60_000)
    assert.equal(calls.find(call => call.args[0] === 'vendor').options.timeout, 20 * 60_000)
  }
})
