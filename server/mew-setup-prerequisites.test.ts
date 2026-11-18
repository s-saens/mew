import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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

test('unattended Termux installs missing packages without asking', () => {
  const result = run('unattended=true; need_node; need_build_tools', { interactive: 1, accept: 1 })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /<nodejs-lts> <npm>/)
  assert.match(result.stdout, /<clang> <make> <python> <tmux>/)
})

test('Termux setup omits browser preparation while Linux keeps it', () => {
  const browserSetup = source.slice(source.indexOf('prepare_source_browsers() {'), source.indexOf('cmd_update() {'))
  const body = `${browserSetup}
npm() { echo "$*"; }
prepare_source_browsers install
prepare_source_browsers check`
  assert.equal(run(body).stdout, '')
  assert.equal(run(body, { os: 'GNU/Linux' }).stdout, 'run browsers:install\nrun browsers:check\n')
})

test('Android can load browser routes without importing Playwright', () => {
  const browserRoutes = new URL('./dom-browser.ts', import.meta.url).href
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    Object.defineProperty(process, 'platform', { value: 'android' });
    await import(${JSON.stringify(browserRoutes)});
  `], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})

test('Termux PostgreSQL uses a private socket and reuses its cluster', t => {
  const state = mkdtempSync(path.join(os.tmpdir(), 'mew-termux-pg-'))
  t.after(() => rmSync(state, { recursive: true, force: true }))
  const helper = readFileSync(new URL('../tools/termux-postgres.sh', import.meta.url), 'utf8')
  const result = run(`${helper}
STATE_DIR=$TEST_STATE
AVAILABLE='pg_ctl'
initdb() { echo init; printf '18\\n' > "$2/PG_VERSION"; }
pg_ctl() {
  case "${'$'}{*: -1}" in
    status) [ -f "$STATE_DIR/running" ] ;;
    start) printf '%s\\n' "$*"; touch "$STATE_DIR/running" ;;
    stop) rm "$STATE_DIR/running" ;;
  esac
}
start_termux_postgres
start_termux_postgres
printf '%s\\n' "$DATABASE_URL"
stop_termux_postgres`.replace('$TEST_STATE', JSON.stringify(state)))
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.match(/^init$/gm)?.length, 1)
  assert.match(result.stdout, /-h '' -k .*\/postgres\/socket start/)
  const connection = new URL(result.stdout.trim().split('\n').at(-1)!)
  assert.equal(connection.searchParams.get('host'), path.join(state, 'postgres/socket'))
  assert.equal(statSync(path.join(state, 'postgres/socket')).mode & 0o777, 0o700)
})
