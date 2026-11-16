import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const source = readFileSync(new URL('../mew', import.meta.url), 'utf8')
const requirements = source.slice(source.indexOf('is_termux() {'), source.indexOf('# ── process'))

function run(body: string, env: { os?: string; interactive?: number; accept?: number; nodeOk?: string; prefix?: string; available?: string } = {}) {
  const script = `set -eu
say() { printf '%s\\n' "$*"; }
die() { printf 'error: %s\\n' "$*" >&2; exit 1; }
${requirements}
uname() { if [ "$1" = -o ]; then printf '%s\\n' "${env.os || 'Android'}"; else printf 'Linux\\n'; fi; }
command() {
  if [ "$1" = -v ]; then
    case " $AVAILABLE " in *" $2 "*) return 0;; *) return 1;; esac
  fi
  builtin command "$@"
}
interactive() { return "${env.interactive ?? 0}"; }
yes_no() { return "${env.accept ?? 0}"; }
pkg() { printf 'PKG'; printf ' <%s>' "$@"; printf '\\n'; INSTALLED=1; }
sudo() { printf 'UNEXPECTED SUDO\\n'; return 1; }
node_version_ok() { [ "${env.nodeOk ?? '$INSTALLED'}" = 1 ]; }
INSTALLED=0
${body}`
  return spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: { ...process.env, PREFIX: env.prefix ?? '/data/data/com.termux/files/usr', AVAILABLE: env.available ?? 'pkg' },
  })
}

test('Termux installs Node with pkg without nvm', () => {
  const result = run('need_node')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /PKG <install> <-y> <nodejs-lts> <npm>/)
  assert.doesNotMatch(result.stdout, /nvm|SUDO/)
})

test('Termux installs missing tools with pkg and no sudo', () => {
  const result = run('need_build_tools', { available: 'pkg tmux' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /PKG <install> <-y> <clang> <make> <python>/)
  assert.doesNotMatch(result.stdout, /SUDO|build-essential/)
})

test('Termux declined or noninteractive install gives a manual command', () => {
  for (const options of [{ accept: 1 }, { interactive: 1 }]) {
    const result = run('need_build_tools', options)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /pkg install/)
    assert.doesNotMatch(result.stdout, /PKG|SUDO/)
  }
})

test('existing valid Node is left alone', () => {
  const result = run('need_node', { nodeOk: '1' })
  assert.equal(result.status, 0, result.stderr)
  assert.doesNotMatch(result.stdout, /PKG/)
})

test('Termux reports an unusable Node after package installation', () => {
  const result = run('need_node', { nodeOk: '0' })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Node still cannot run or is too old/)
})

test('Termux detection excludes ordinary Linux with a similar prefix', () => {
  const result = run('if is_termux; then exit 1; fi', { os: 'GNU/Linux' })
  assert.equal(result.status, 0, result.stderr)
})
