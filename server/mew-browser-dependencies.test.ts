import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const source = await fs.readFile(new URL('../mew', import.meta.url), 'utf8')
const extract = (name: string) => `${name}() {${source.split(`${name}() {`)[1].split('\n}\n')[0]}\n}\n`

test('setup installs browser dependencies before building and aborts when preparation fails', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-setup-browser-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const script = `set -euo pipefail
    say(){ :; }; need_node(){ :; }; need_build_tools(){ :; }; load_config(){ :; }
    prepare_desktop(){ echo desktop; }; start_server(){ echo start; }
    create_first_owner(){ :; }; url(){ :; }
    npm(){ echo "$*"; if [ "$*" = 'run browsers:install' ]; then return "$TEST_FAILURE"; fi; }
    ${extract('cmd_setup')}
    cmd_setup
  `
  for (const failure of [0, 1]) {
    const result = await exec('bash', ['-c', script], { env: { ...process.env, CONFIG: path.resolve(import.meta.dirname, '../mew'), TEST_FAILURE: String(failure) }, cwd: directory })
      .then(value => ({ ...value, code: 0 }), error => ({ stdout: error.stdout as string, stderr: error.stderr as string, code: error.code as number }))
    assert.equal(result.code, failure)
    assert.deepEqual(result.stdout.trim().split('\n'), failure
      ? ['ci --no-audit --no-fund', 'run browsers:install']
      : ['ci --no-audit --no-fund', 'run browsers:install', 'desktop', 'run build', 'start'])
  }
})

test('start performs a read-only prerequisite check before creating state or processes', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-start-browser-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  await fs.mkdir(path.join(directory, 'dist'))
  await fs.writeFile(path.join(directory, 'dist/index.html'), 'fixture')
  const script = `set -euo pipefail
    say(){ :; }; running_pid(){ return 1; }
    die(){ echo "$*" >&2; exit 1; }
    npm(){ echo "$*"; return 1; }
    ${extract('start_server')}
    start_server
  `
  await assert.rejects(exec('bash', ['-c', script], { cwd: directory, env: { ...process.env, STATE_DIR: path.join(directory, 'state') } }), error => {
    const failure = error as Error & { code: number; stdout: string; stderr: string }
    assert.equal(failure.code, 1)
    assert.equal(failure.stdout.trim(), 'run browsers:check')
    assert.match(failure.stderr, /npm run browsers:install/)
    return true
  })
  await assert.rejects(fs.stat(path.join(directory, 'state')), { code: 'ENOENT' })
})

test('restart rejects missing dependencies before calling stop or start', async () => {
  const restart = source.split('\n').find(line => line.trim().startsWith('restart)'))
  assert.ok(restart)
  const script = `set -euo pipefail
    load_config(){ :; }; die(){ echo "$*" >&2; exit 1; }
    npm(){ echo "$*"; return 1; }
    stop_server(){ echo stop; }; start_server(){ echo start; }; say(){ :; }; url(){ :; }
    case restart in
    ${restart}
    esac
  `
  await assert.rejects(exec('bash', ['-c', script]), error => {
    const failure = error as Error & { code: number; stdout: string; stderr: string }
    assert.equal(failure.code, 1)
    assert.equal(failure.stdout.trim(), 'run browsers:check')
    assert.match(failure.stderr, /npm run browsers:install/)
    return true
  })
})
