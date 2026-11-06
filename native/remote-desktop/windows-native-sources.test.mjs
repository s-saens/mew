import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { preserveWindowsNativeSources } from './build-windows-package.mjs'

async function fixture(work) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-native-sources-test-'))
  const source = path.join(root, 'source'), destination = path.join(root, 'collected')
  await fs.mkdir(source)
  await fs.writeFile(path.join(source, 'package.json'), JSON.stringify({ dependencies: { 'node-datachannel': '0.33.4' } }))
  const components = [
    { name: 'rtc', repository: 'https://example.test/rtc.git', commit: 'a'.repeat(40), submodules: true },
    { name: 'port', repository: 'https://example.test/port.git', commit: 'b'.repeat(40), sparse: ['ports/openssl'] },
  ]
  const calls = []
  const run = (command, args, options) => {
    assert.equal(command, 'git')
    calls.push({ args, directory: options.cwd })
    const component = components.find(item => item.name === path.basename(options.cwd))
    if (args[0] === 'init') mkdirSync(path.join(options.cwd, '.git'))
    if (args[0] === 'checkout') writeFileSync(path.join(options.cwd, 'LICENSE'), 'original notice')
    if (args.includes('update')) {
      mkdirSync(path.join(options.cwd, 'deps/child'), { recursive: true })
      writeFileSync(path.join(options.cwd, 'deps/child/.git'), 'internal repository pointer')
      writeFileSync(path.join(options.cwd, 'deps/child/LICENSE'), 'child license')
    }
    return { status: 0, stdout: args[0] === 'rev-parse' ? component.commit : args.includes('status') ? ` ${'c'.repeat(40)} deps/child (pinned)` : '' }
  }
  try { await work({ root, source, destination, components, calls, run }) }
  finally { await fs.rm(root, { recursive: true, force: true }) }
}

test('npm native source collection checks immutable heads, recursive dependencies, original notices, and removes Git metadata', () => fixture(async options => {
  await preserveWindowsNativeSources(options)
  const inventory = JSON.parse(await fs.readFile(path.join(options.destination, 'SOURCE-ORIGINS.json'), 'utf8'))
  assert.equal(inventory.libdatachannelVersion, '0.24.5')
  assert.equal(inventory.opensslVersion, '3.6.4')
  assert.match(inventory.components[0].submoduleCommits, /cccccccc/)
  assert.ok(options.calls.some(call => call.args[0] === 'sparse-checkout'))
  assert.ok(options.calls.some(call => call.args[0] === 'fetch' && call.args.includes(options.components[0].commit)))
  assert.equal(await fs.readFile(path.join(options.destination, 'rtc/deps/child/LICENSE'), 'utf8'), 'child license')
  await assert.rejects(fs.stat(path.join(options.destination, 'rtc/.git')), { code: 'ENOENT' })
  await assert.rejects(fs.stat(path.join(options.destination, 'rtc/deps/child/.git')), { code: 'ENOENT' })
}))

test('unexpected npm version and mismatched source commits fail before source coverage is recorded', () => fixture(async options => {
  await fs.writeFile(path.join(options.source, 'package.json'), '{"dependencies":{"node-datachannel":"next"}}')
  await assert.rejects(preserveWindowsNativeSources({ ...options, run() { assert.fail('Unknown versions cannot fetch guessed sources') } }), /source provenance/)
  await fs.writeFile(path.join(options.source, 'package.json'), '{"dependencies":{"node-datachannel":"0.33.4"}}')
  await assert.rejects(preserveWindowsNativeSources({ ...options, run(command, args, settings) {
    const result = options.run(command, args, settings)
    return args[0] === 'rev-parse' ? { ...result, stdout: 'd'.repeat(40) } : result
  } }), /identity mismatch/)
  await assert.rejects(fs.stat(path.join(options.destination, 'SOURCE-ORIGINS.json')), { code: 'ENOENT' })
}))

test('uninitialized or changed dependency submodules cannot be claimed as corresponding source', () => fixture(async options => {
  await assert.rejects(preserveWindowsNativeSources({ ...options, run(command, args, settings) {
    const result = options.run(command, args, settings)
    return args.includes('status') ? { ...result, stdout: `-${'c'.repeat(40)} deps/child` } : result
  } }), /dependency source mismatch/)
  await assert.rejects(fs.stat(path.join(options.destination, 'SOURCE-ORIGINS.json')), { code: 'ENOENT' })
}))
