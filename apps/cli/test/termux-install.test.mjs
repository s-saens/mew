import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'

const exec = promisify(execFile)

test('Termux bootstrap installs verified source, runs setup and exposes the mew command', {
  skip: process.platform !== 'linux',
}, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-termux-test-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const home = path.join(directory, "user's home")
  const prefix = path.join(directory, 'usr')
  const bin = path.join(prefix, 'bin')
  const launcher = path.join(bin, 'mew')
  const source = path.join(directory, 'source')
  const archive = path.join(directory, 'source.tar.gz')
  const installer = path.join(directory, 'install.sh')
  const destination = path.join(home, '.local/opt/mew-termux-0.1.7')
  for (const folder of [home, bin, source]) await fs.mkdir(folder, { recursive: true })
  await fs.symlink('/bin/bash', path.join(bin, 'bash'))
  await fs.writeFile(path.join(source, 'package-lock.json'), '{}')
  await fs.writeFile(path.join(source, 'mew'), `set -e
case "$1" in
  setup) test ! -t 0; test "$*" = "setup --termux-defaults"; test -z "${'$'}{TEST_FAIL_SETUP:-}"; printf 'setup\\n' >> setup.log ;;
  *) printf '<%s>\\n' "$0" "$@" ;;
esac
`)
  execFileSync('tar', ['-czf', archive, '-C', directory, 'source'])
  const hash = createHash('sha256').update(await fs.readFile(archive)).digest('hex')
  const script = await fs.readFile(new URL('../../../install-termux.sh', import.meta.url), 'utf8')
  await fs.writeFile(installer, script.replace(/^checksum=.*/m, 'checksum=' + hash))
  for (const [name, body] of [
    ['uname', 'echo "${TEST_OS:-Android}"'],
    ['pkg', 'exit 1'],
    ['curl', 'while [ "$1" != --output ]; do shift; done; cp "$TEST_ARCHIVE" "$2"'],
  ]) {
    await fs.writeFile(path.join(bin, name), '#!/bin/sh\n' + body + '\n', { mode: 0o755 })
  }
  const env = {
    ...process.env, HOME: home, PREFIX: prefix, PATH: bin + ':' + process.env.PATH,
    TEST_INSTALLER: installer, TEST_ARCHIVE: archive,
  }
  const run = (overrides = {}) => exec('script', ['-qec', 'cat "$TEST_INSTALLER" | bash', '/dev/null'], {
    env: { ...env, ...overrides },
  })

  await assert.rejects(run({ TEST_OS: 'GNU/Linux' }), error => /native Termux/.test(error.stdout))
  await assert.rejects(run({ TEST_ARCHIVE: installer }), error => /checksum verification failed/.test(error.stdout))
  await assert.rejects(fs.stat(destination), { code: 'ENOENT' })
  await fs.mkdir(destination, { recursive: true })
  await fs.writeFile(path.join(destination, 'user-file'), 'keep')
  await assert.rejects(run(), error => /Preserving an existing/.test(error.stdout))
  assert.equal(await fs.readFile(path.join(destination, 'user-file'), 'utf8'), 'keep')
  await fs.rm(destination, { recursive: true })

  await fs.writeFile(launcher, 'unrelated command')
  await assert.rejects(run(), error => /Preserving an existing command/.test(error.stdout))
  assert.equal(await fs.readFile(launcher, 'utf8'), 'unrelated command')
  await fs.rm(launcher)
  await assert.rejects(run({ TEST_FAIL_SETUP: '1' }))
  await assert.rejects(fs.stat(launcher), { code: 'ENOENT' })

  await run()
  await run({ TEST_ARCHIVE: '/missing' })
  assert.equal(await fs.readFile(path.join(destination, 'setup.log'), 'utf8'), 'setup\nsetup\n')
  const { stdout } = await exec('mew', ['users', 'a b', ''], { cwd: directory, env })
  assert.equal(stdout, '<' + path.join(destination, 'mew') + '>\n<users>\n<a b>\n<>\n')
  await assert.rejects(fs.stat(destination + '.lock'), { code: 'ENOENT' })
})
