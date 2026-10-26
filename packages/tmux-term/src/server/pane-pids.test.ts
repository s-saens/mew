import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createTmuxManager } from './tmux.ts'

test('pane PID discovery uses the configured multiplexer namespace and rejects invalid process identities', { skip: process.platform === 'win32' }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-pane-pids-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const fixture = path.join(directory, 'multiplexer')
  await fs.writeFile(fixture, `#!${process.execPath}
const assert = require('node:assert/strict');
assert.deepEqual(process.argv.slice(2), ['-L', 'isolated-fixture', 'list-panes', '-a', '-F', '#{session_name}\\t#{pane_pid}']);
process.stdout.write('mewcmd-first\\t123\\r\\nmewcmd-first\\t456\\nmewcmd-second\\t789\\r\\ninvalid:name\\t999\\nmewcmd-zero\\t0\\nmewcmd-bad\\tNaN\\nmewcmd-fraction\\t12.5\\nmewcmd-large\\t9007199254740992\\n');
`, { mode: 0o700 })
  const previous = { binary: process.env.MEW_MULTIPLEXER, namespace: process.env.MEW_MULTIPLEXER_NAMESPACE }
  t.after(() => {
    if (previous.binary === undefined) delete process.env.MEW_MULTIPLEXER; else process.env.MEW_MULTIPLEXER = previous.binary
    if (previous.namespace === undefined) delete process.env.MEW_MULTIPLEXER_NAMESPACE; else process.env.MEW_MULTIPLEXER_NAMESPACE = previous.namespace
  })
  process.env.MEW_MULTIPLEXER = fixture
  process.env.MEW_MULTIPLEXER_NAMESPACE = 'isolated-fixture'
  assert.deepEqual(await createTmuxManager({ cwd: directory }).listPanePids(), [
    { session: 'mewcmd-first', pid: 123 }, { session: 'mewcmd-first', pid: 456 }, { session: 'mewcmd-second', pid: 789 },
  ])
})
