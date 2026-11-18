import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import * as tar from 'tar'
import { runtimeEnvironment } from '../src/launcher.mjs'

const execute = promisify(execFile)
const source = new URL('../../../install.sh', import.meta.url)
const posix = { skip: process.platform === 'win32' }
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'"

async function fixture(t, { unsafe = false, bundleVersion = '0.1.0' } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-shell-fixture-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const home = path.join(directory, "home user's folder"), mocks = path.join(directory, 'mocks')
  const nodeRoot = path.join(directory, 'node-v24.21.0-linux-x64')
  const cliRoot = path.join(directory, 'cli'), project = path.join(directory, 'project')
  for (const folder of [home, mocks, path.join(nodeRoot, 'bin'), path.join(cliRoot, 'bin'), path.join(cliRoot, 'src'), project]) await fs.mkdir(folder, { recursive: true })
  await fs.writeFile(path.join(project, 'notes.md'), 'Keep existing work.\n')
  const node = `#!/bin/sh\nif [ "\${1:-}" = --version ]; then printf 'v24.21.0\\n'; else exec ${quote(process.execPath)} "$@"; fi\n`
  await fs.writeFile(path.join(nodeRoot, 'bin/node'), node, { mode: 0o700 })
  await fs.writeFile(path.join(cliRoot, 'package.json'), JSON.stringify({ name: 'mew-ide', version: bundleVersion, type: 'module' }))
  await fs.writeFile(path.join(cliRoot, 'LICENSE'), 'Fixture license\n')
  await fs.writeFile(path.join(cliRoot, 'src/runtime.mjs'), 'export const fixture = true\n')
  await fs.writeFile(path.join(cliRoot, 'bin/mew.mjs'), `import fs from 'node:fs';\nif (process.argv[2] === '--version') console.log(${JSON.stringify(bundleVersion)});\nelse fs.appendFileSync(process.env.MEW_TEST_LAUNCH_RECORD, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), searchPath: process.env.PATH }) + '\\n');\n`)
  if (unsafe) await fs.symlink('../../../outside', path.join(cliRoot, 'bin/escape'))
  const nodeArchive = path.join(directory, 'node.tar.gz'), cliArchive = path.join(directory, 'cli.tar.gz')
  await tar.c({ file: nodeArchive, cwd: directory, gzip: true, portable: true }, [path.basename(nodeRoot)])
  await tar.c({ file: cliArchive, cwd: cliRoot, gzip: true, portable: true }, ['package.json', 'LICENSE', 'bin', 'src'])
  const checksum = hash(await fs.readFile(cliArchive))
  const checksums = path.join(directory, 'SHA256SUMS')
  await fs.writeFile(checksums, `${checksum}  mew-cli-standalone.tar.gz\n`)
  let script = await fs.readFile(source, 'utf8')
  assert.equal((script.match(/node_sha=[a-f0-9]{64}/g) || []).length, 4)
  script = script.replace(/node_sha=[a-f0-9]{64}/g, `node_sha=${hash(await fs.readFile(nodeArchive))}`)
  const installer = path.join(directory, 'install.sh')
  await fs.writeFile(installer, script)
  await fs.writeFile(path.join(mocks, 'id'), '#!/bin/sh\nprintf "%s\\n" "${FIXTURE_UID:-1000}"\n', { mode: 0o700 })
  await fs.writeFile(path.join(mocks, 'uname'), '#!/bin/sh\nif [ "$1" = -s ]; then printf "%s\\n" "${FIXTURE_PLATFORM:-Linux}"; else printf "%s\\n" "${FIXTURE_ARCH:-x86_64}"; fi\n', { mode: 0o700 })
  for (const command of ['npm', 'npx', 'git', 'sudo']) await fs.writeFile(path.join(mocks, command), '#!/bin/sh\necho "Unexpected external installer command" >&2\nexit 99\n', { mode: 0o700 })
  await fs.writeFile(path.join(mocks, 'curl'), `#!${process.execPath}\nimport fs from 'node:fs';\nconst args = process.argv.slice(2), url = args.at(-1), output = args[args.indexOf('--output') + 1];\nif (!args.includes('=https') || !args.includes('--proto-redir')) throw new Error('Unrestricted transport');\nfs.appendFileSync(process.env.FIXTURE_CURL_LOG, url + '\\n');\nconst file = url.endsWith('/SHA256SUMS') ? process.env.FIXTURE_CHECKSUMS : url.includes('nodejs.org') ? process.env.FIXTURE_NODE : process.env.FIXTURE_CLI;\nfs.copyFileSync(file, output);\nif (process.env.FIXTURE_BAD_DOWNLOAD && url.includes(process.env.FIXTURE_BAD_DOWNLOAD)) fs.appendFileSync(output, 'corrupt');\nif (process.env.FIXTURE_FAIL_DOWNLOAD && url.includes(process.env.FIXTURE_FAIL_DOWNLOAD)) process.exit(22);\n`, { mode: 0o700 })
  // Mock executables are ESM even when the host's default package type differs.
  await fs.writeFile(path.join(mocks, 'package.json'), '{"type":"module"}')
  const installRoot = path.join(home, '.local/share/mew-bootstrap'), wrapper = path.join(home, '.local/bin/mew-ide')
  const env = { ...process.env, HOME: home, XDG_DATA_HOME: path.join(home, '.local/share'), PATH: mocks + path.delimiter + process.env.PATH,
    MEW_INSTALL_DIR: installRoot, MEW_INSTALL_BIN_DIR: path.dirname(wrapper), MEW_INSTALL_VERSION: '0.1.0',
    MEW_TEST_LAUNCH_RECORD: path.join(directory, 'launches.jsonl'), FIXTURE_CURL_LOG: path.join(directory, 'curl.log'),
    FIXTURE_NODE: nodeArchive, FIXTURE_CLI: cliArchive, FIXTURE_CHECKSUMS: checksums,
  }
  const run = (args = [], overrides = {}) => execute('bash', [installer, ...args], { cwd: project, env: { ...env, ...overrides }, timeout: 20_000 })
  return { directory, env, installRoot, wrapper, project, run, checksums, cliArchive, checksum }
}

test('curl bootstrap installs privately without npm, preserves argument boundaries, and reuses downloads', posix, async t => {
  const f = await fixture(t)
  const args = ['--workspace', "a folder's $value", '--no-open', '--no-autostart']
  const { stderr } = await f.run(args)
  assert.match(stderr, /Preparing Mew 0\.1\.0 for linux\/x64\.\.\./)
  assert.match(stderr, /Installing private Node\.js 24\.21\.0\.\.\./)
  const record = JSON.parse((await fs.readFile(f.env.MEW_TEST_LAUNCH_RECORD, 'utf8')).trim())
  assert.deepEqual(record.args, args)
  assert.equal(record.cwd, await fs.realpath(f.project))
  assert.ok(record.searchPath.startsWith(path.join(f.installRoot, 'node/v24.21.0-linux-x64/bin')))
  assert.equal(await fs.readFile(path.join(f.project, 'notes.md'), 'utf8'), 'Keep existing work.\n')
  assert.equal((await fs.stat(f.wrapper)).mode & 0o777, 0o700)
  assert.equal((await fs.stat(f.installRoot)).mode & 0o777, 0o700)
  assert.equal(await fs.stat(path.join(f.env.HOME, '.local/share/mew')).catch(() => null), null)
  await f.run(['status'])
  const requests = (await fs.readFile(f.env.FIXTURE_CURL_LOG, 'utf8')).trim().split('\n')
  assert.equal(requests.filter(url => url.includes('nodejs.org')).length, 1)
  assert.equal(requests.filter(url => url.endsWith('mew-cli-standalone.tar.gz')).length, 1)
  await execute(f.wrapper, ['stop'], { env: f.env })
  const launches = (await fs.readFile(f.env.MEW_TEST_LAUNCH_RECORD, 'utf8')).trim().split('\n').map(JSON.parse)
  assert.deepEqual(launches.map(item => item.args), [args, ['status'], ['stop']])
})

test('checksum and transfer failures stop before running archive contents and clean temporary state', posix, async t => {
  for (const fault of [{ FIXTURE_BAD_DOWNLOAD: 'nodejs.org' }, { FIXTURE_BAD_DOWNLOAD: 'mew-cli-standalone' }, { FIXTURE_FAIL_DOWNLOAD: 'nodejs.org' }]) {
    const f = await fixture(t)
    await assert.rejects(f.run([], fault))
    assert.equal(await fs.stat(f.wrapper).catch(() => null), null)
    assert.equal(await fs.stat(f.env.MEW_TEST_LAUNCH_RECORD).catch(() => null), null)
    assert.ok(!(await fs.readdir(f.installRoot)).some(name => name.startsWith('.download') || name === '.install-lock'))
    await f.run(['status'])
  }
})

test('a staging failure preserves its exit status and releases the installer lock', posix, async t => {
  const f = await fixture(t)
  await fs.writeFile(path.join(f.directory, 'mocks', 'mktemp'), '#!/bin/sh\nexit 43\n', { mode: 0o700 })
  await assert.rejects(f.run(), { code: 43 })
  await assert.rejects(fs.stat(path.join(f.installRoot, '.install-lock')), { code: 'ENOENT' })
})

test('an unexpected zero exit during staging reports an incomplete install', posix, async t => {
  const f = await fixture(t)
  const installer = path.join(f.directory, 'install.sh')
  const script = await fs.readFile(installer, 'utf8')
  await fs.writeFile(installer, script.replace('  release_base=', '  exit 0\n  release_base='))
  await assert.rejects(f.run(), { code: 1 })
  await assert.rejects(fs.stat(path.join(f.installRoot, '.install-lock')), { code: 'ENOENT' })
})

test('missing or ambiguous release identity fails before installing Node or running Mew', posix, async t => {
  const f = await fixture(t)
  await fs.writeFile(f.checksums, `${f.checksum}  mew-cli-standalone.tar.gz\n${f.checksum}  mew-cli-standalone.tar.gz\n`)
  await assert.rejects(f.run(), /exactly one standalone launcher checksum/)
  assert.equal(await fs.stat(path.join(f.installRoot, 'node')).catch(() => null), null)
  await fs.writeFile(f.checksums, `${f.checksum}  wrong.tar.gz\n`)
  await assert.rejects(f.run(), /exactly one standalone launcher checksum/)
})

test('unsafe links and mismatched bundle versions are rejected before launcher execution', posix, async t => {
  for (const config of [{ unsafe: true }, { bundleVersion: '9.9.9' }]) {
    const f = await fixture(t, config)
    await assert.rejects(f.run(), config.unsafe ? /links or unsupported/ : /identity mismatch/)
    assert.equal(await fs.stat(f.env.MEW_TEST_LAUNCH_RECORD).catch(() => null), null)
    assert.equal(await fs.stat(path.join(f.directory, 'outside')).catch(() => null), null)
  }
})

test('existing unrelated commands and nonempty installation directories are preserved', posix, async t => {
  const f = await fixture(t)
  await fs.mkdir(path.dirname(f.wrapper), { recursive: true })
  await fs.writeFile(f.wrapper, '#!/bin/sh\necho existing command\n')
  await assert.rejects(f.run(), /Preserving an existing command/)
  assert.equal(await fs.readFile(f.wrapper, 'utf8'), '#!/bin/sh\necho existing command\n')
  await fs.rm(f.wrapper)
  await fs.mkdir(f.installRoot, { recursive: true })
  await fs.writeFile(path.join(f.installRoot, 'personal.txt'), 'preserve')
  await assert.rejects(f.run(), /Preserving an unrelated directory/)
  assert.equal(await fs.readFile(path.join(f.installRoot, 'personal.txt'), 'utf8'), 'preserve')
  assert.equal(await fs.stat(f.env.FIXTURE_CURL_LOG).catch(() => null), null)
})

test('unsupported hosts and root invocation fail without installation; help is read-only', posix, async t => {
  const f = await fixture(t)
  await assert.rejects(f.run([], { FIXTURE_PLATFORM: 'MINGW64_NT' }), /inside WSL 2/)
  await assert.rejects(f.run([], { FIXTURE_ARCH: 'riscv64' }), /x64 and arm64/)
  await assert.rejects(f.run([], { FIXTURE_UID: '0' }), /ordinary user/)
  assert.match((await f.run(['--help'], { FIXTURE_UID: '0' })).stdout, /No npm or Git/)
  assert.equal(await fs.stat(f.installRoot).catch(() => null), null)
})

test('installation markers and nested symlinks cannot redirect writes into unrelated folders', posix, async t => {
  for (const target of ['.mew-bootstrap', 'node', 'cli', 'node/v24.21.0-linux-x64', 'cli/0.1.0']) {
    const f = await fixture(t)
    const external = path.join(f.directory, 'unrelated')
    await fs.mkdir(external)
    const marker = path.join(external, 'personal.txt')
    await fs.writeFile(marker, 'preserve')
    await fs.mkdir(f.installRoot, { recursive: true })
    const destination = path.join(f.installRoot, target)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    if (target !== '.mew-bootstrap') await fs.writeFile(path.join(f.installRoot, '.mew-bootstrap'), 'mew-bootstrap-v1\n')
    await fs.symlink(target === '.mew-bootstrap' ? marker : external, destination)
    await assert.rejects(f.run(), /Preserving an (?:unrelated installation marker|unexpected.*symlink)/)
    assert.equal(await fs.readFile(marker, 'utf8'), 'preserve')
    assert.deepEqual(await fs.readdir(external), ['personal.txt'])
    assert.equal(await fs.stat(f.env.MEW_TEST_LAUNCH_RECORD).catch(() => null), null)
  }
})

test('login runtime can invoke its private Node even when the login PATH has no Node', posix, async () => {
  const environment = runtimeEnvironment('/mew-runtime', { workspace: os.tmpdir(), dataDir: '/mew-data', port: 5000 }, { PATH: '/missing-login-tools' })
  const result = await execute('node', ['-p', 'process.execPath'], { env: environment })
  assert.equal(await fs.realpath(result.stdout.trim()), await fs.realpath(process.execPath))
})
