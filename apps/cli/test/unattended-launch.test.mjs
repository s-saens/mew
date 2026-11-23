import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { launch, runtimeEnvironment } from '../src/launcher.mjs'
import { parseOptions } from '../src/options.mjs'
import { acquireDataLock } from '../src/lock.mjs'

for (const failed of ['none', 'database', 'host']) test(`unattended launch database lifecycle: ${failed}`, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-launch-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const trace = [], options = { workspace: root, dataDir: path.join(root, 'accounts'), port: 0, legacyPidfile: path.join(root, 'none'), service: true, installChannel: 'curl' }
  const operation = launch({ options, version: '0.1.0', target: {},
    control: { start: async () => trace.push('control'), close: async () => trace.push('close') },
    prepare: async () => { trace.push('runtime'); return root },
    prepareBrowsers: async (_runtime, settings) => { assert.equal(settings.checkOnly, true); trace.push('browsers') },
    prepareDatabase: async () => {
      trace.push('database')
      if (failed === 'database') throw new Error('database failed')
      return { databaseUrl: 'postgres://managed/mew', stop: async () => trace.push('stop') }
    },
    host: async (_runtime, settings) => {
      trace.push('host'); assert.equal(settings.databaseUrl, 'postgres://managed/mew')
      const env = runtimeEnvironment(root, settings, { MEW_INSTALL_CHANNEL: 'npm', MEW_INSTALL_VERSION: '99.0.0' })
      assert.equal(env.MEW_INSTALL_CHANNEL, 'curl')
      assert.equal(env.MEW_INSTALL_VERSION, '0.1.0')
      if (failed === 'host') throw new Error('host failed')
      return 0
    },
  })
  if (failed === 'none') assert.equal(await operation, 0)
  else await assert.rejects(operation, new RegExp(failed + ' failed'))
  assert.deepEqual(trace, failed === 'database' ? ['control','runtime','browsers','database','close'] : ['control','runtime','browsers','database','host','stop','close'])
  const unlock = await acquireDataLock(options.dataDir)
  await unlock()
})

test('unattended defaults preserve external database settings and separate durable files from account data', () => {
  const options = parseOptions([], { env: { DATABASE_URL: 'postgres://external/mew' }, cwd: process.cwd() })
  assert.equal(options.databaseUrl, 'postgres://external/mew')
  assert.equal(options.autostart, true)
  assert.equal(options.service, false)
  assert.equal(options.cacheDir.startsWith(options.dataDir + path.sep), false)
  assert.equal(parseOptions(['--service']).open, false)
  assert.equal(parseOptions(['--service']).autostart, false)
  assert.equal(parseOptions(['--installer']).foreground, true)
})
