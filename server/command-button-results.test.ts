import './test-isolated-data.ts'
import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'
import { gunzipSync } from 'node:zlib'
import { createTmuxManager } from '@mew/tmux-term/server'
import { CommandButtonResultStore, CommandButtonRunningError } from './command-button-results.ts'
import { upsertUser } from './auth.ts'

const exec = promisify(execFile)
const owner = 'command-results@example.test'
const firstSession = 'mewcmd-1111111111111111'
const secondSession = 'mewcmd-2222222222222222'

test('a pending start is exclusive and a failed start restores the previous result', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-button-store-'))
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  const manager = createTmuxManager({ cwd: temp })
  let listCalls = 0
  manager.list = async () => {
    if (listCalls++ === 0) throw new Error('server exited unexpectedly')
    return []
  }
  let resolveStart!: () => void
  const pending = new Promise<void>(resolve => { resolveStart = resolve })
  manager.startCommand = async () => pending
  const store = new CommandButtonResultStore(manager, path.join(temp, 'results'))
  const start = store.start(firstSession, 'printf first', temp, owner)
  await assert.rejects(store.start(firstSession, 'printf second', temp, owner), CommandButtonRunningError)
  resolveStart()
  await start
  assert.equal(listCalls, 2, 'a tmux shutdown race is retried before starting')
  const current = path.join(temp, 'results', firstSession, 'current')
  const record = JSON.parse(fs.readFileSync(path.join(current, 'record.json'), 'utf8'))
  record.state = 'failed'; record.exitCode = 7; record.finishedAt = Date.now()
  fs.writeFileSync(path.join(current, 'record.json'), JSON.stringify(record))
  fs.writeFileSync(path.join(current, 'preview.txt'), 'old result')
  manager.startCommand = async () => { throw new Error('cannot start') }
  await assert.rejects(store.start(firstSession, 'new command', temp, owner), /cannot start/)
  assert.equal((await store.result(firstSession))?.text, 'old result')
  const previous = path.join(temp, 'results', firstSession, 'previous')
  fs.renameSync(current, previous)
  fs.mkdirSync(current)
  assert.equal((await store.result(firstSession))?.text, 'old result', 'a partial new run must not hide the previous result')
  await assert.rejects(store.start(firstSession, 'new command', temp, owner), /cannot start/)
  assert.equal((await store.result(firstSession))?.text, 'old result')
  assert.throws(() => store.archive('../escape'))
})

let tmux: string | undefined
try { tmux = execFileSync('which', ['tmux'], { encoding: 'utf8' }).trim() } catch { /* optional */ }

test('one-shot results survive tmux exit, replace the previous run, and remain scoped', { skip: !tmux, timeout: 45_000 }, async t => {
  upsertUser(owner, { displayName: 'Command Results', hash: 'fixture', role: 'owner', mustChangePassword: false, createdAt: 0, passwordChangedAt: 0 })
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-button-results-'))
  const oldNamespace = process.env.MEW_MULTIPLEXER_NAMESPACE
  const namespace = `mew-button-test-${crypto.randomBytes(8).toString('hex')}`
  process.env.MEW_MULTIPLEXER_NAMESPACE = namespace
  const manager = createTmuxManager({ cwd: temp })
  const store = new CommandButtonResultStore(manager, path.join(temp, 'results'))
  t.after(async () => {
    await exec(tmux!, ['-L', namespace, 'kill-server']).catch(() => {})
    if (oldNamespace === undefined) delete process.env.MEW_MULTIPLEXER_NAMESPACE
    else process.env.MEW_MULTIPLEXER_NAMESPACE = oldNamespace
    fs.rmSync(temp, { recursive: true, force: true })
  })
  // Keep the isolated tmux server alive between fast one-shot sessions.
  await manager.create('test-anchor', temp)
  const waitFor = async (predicate: () => Promise<boolean>) => {
    const deadline = Date.now() + 12_000
    while (!await predicate()) {
      assert.ok(Date.now() < deadline, 'timed out waiting for command')
      await new Promise(resolve => setTimeout(resolve, 30))
    }
  }
  const finished = async (session: string) => {
    await waitFor(async () => {
      const result = await store.result(session)
      return !!result && result.state !== 'running' && !(await manager.list()).some(item => item.name === session)
    })
    return (await store.result(session))!
  }

  assert.equal(await store.result(firstSession), null)
  await store.start(firstSession, 'printf "first stdout\\n"; printf "last stderr\\n" >&2; printf "identity=%s\\n" "$GIT_AUTHOR_EMAIL"; test -t 0 && printf "tty ready\\n"', temp, owner)
  const success = await finished(firstSession)
  assert.equal(success.state, 'completed')
  assert.equal(success.exitCode, 0)
  assert.match(success.text!, /first stdout/)
  assert.match(success.text!, /last stderr/)
  assert.match(success.text!, /identity=command-results@example\.test/)
  assert.match(success.text!, /tty ready/)
  assert.match(gunzipSync(fs.readFileSync(store.archive(firstSession)!)).toString(), /last stderr/)

  await store.start(secondSession, 'printf "other project\\n"; exit 7', temp, owner)
  const failed = await finished(secondSession)
  assert.equal(failed.state, 'failed')
  assert.equal(failed.exitCode, 7)
  assert.match(failed.text!, /other project/)
  assert.match((await store.result(firstSession))!.text!, /first stdout/)

  await store.start(firstSession, 'printf "waiting\\n"; sleep 0.4; printf "new ending\\n"', temp, owner)
  await assert.rejects(store.start(firstSession, 'not run', temp, owner), CommandButtonRunningError)
  assert.equal((await store.result(firstSession))!.state, 'running')
  const replacement = await finished(firstSession)
  assert.match(replacement.text!, /new ending/)
  assert.doesNotMatch(replacement.text!, /first stdout/)
  assert.equal(fs.existsSync(path.join(temp, 'results', firstSession, 'previous')), false)
  assert.match((await new CommandButtonResultStore(manager, path.join(temp, 'results')).result(secondSession))!.text!, /other project/)

  await store.start(firstSession, 'head -c 600000 /dev/zero | tr "\\0" x; printf END', temp, owner)
  const large = await finished(firstSession)
  assert.equal(large.previewTruncated, true)
  assert.ok(large.text!.endsWith('END'))
  assert.equal(gunzipSync(fs.readFileSync(store.archive(firstSession)!)).length, 600003)
})
