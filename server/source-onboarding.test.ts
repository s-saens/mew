import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const source = await fs.readFile(new URL('../mew', import.meta.url), 'utf8')
const extract = (name: string) => {
  const value = source.match(new RegExp(`^${name}\\(\\) \\{[\\s\\S]*?^\\}`, 'm'))?.[0]
  assert.ok(value, `Missing launcher function ${name}`)
  return value
}

test('source setup arms browser onboarding without asking for an email or issuing a temporary password', async () => {
  const script = `set -euo pipefail
    say(){ :; }; die(){ echo "$*" >&2; exit 1; }; url(){ printf 'http://localhost:5000'; }
    ask(){ echo 'unexpected prompt' >&2; exit 1; }
    node(){
      if [ "$1" = server/usersCli.ts ]; then
        [ "$2" = setup ] && [ "$3" = --json ] || exit 2
        printf '%s' "$MEW_TEST_SETUP_REPLY"
      else command "$MEW_TEST_NODE" "$@"; fi
    }
    ${extract('create_first_owner')}
    create_first_owner
    printf '%s' "$FIRST_OWNER_SETUP_URL"
  `
  const run = (reply: string) => exec('bash', ['-c', script], { env: { ...process.env, MEW_TEST_NODE: process.execPath, MEW_TEST_SETUP_REPLY: reply } })
  const token = 's'.repeat(43)
  assert.equal((await run(JSON.stringify({ setupRequired: true, token }))).stdout, `http://localhost:5000/#setup=${token}`)
  assert.equal((await run(JSON.stringify({ setupRequired: false }))).stdout, '')
  await assert.rejects(run(JSON.stringify({ setupRequired: true, token: 'invalid&query' })), /invalid administrator setup response/)
  await assert.rejects(run('not JSON'), /invalid administrator setup response/)
})

test('source setup prepares first-owner state before starting any server and keeps the token out of its log', () => {
  const setup = extract('cmd_setup')
  assert.ok(setup.indexOf('create_first_owner') < setup.indexOf('start_server'))
  const start = extract('start_server')
  assert.ok(!start.includes('FIRST_OWNER_SETUP_URL'))
  assert.ok(!start.includes('token'))
  assert.ok(!setup.includes('temporary password'))
})
