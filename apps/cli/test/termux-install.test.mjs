import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'

const exec = promisify(execFile)

test('Termux bootstrap installs verified source and runs setup in the terminal', {
  skip: process.platform !== 'linux',
}, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-termux-test-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const home = path.join(directory, 'home')
  const bin = path.join(directory, 'bin')
  const source = path.join(directory, 'source')
  const archive = path.join(directory, 'source.tar.gz')
  const installer = path.join(directory, 'install.sh')
  const destination = path.join(home, '.local/opt/mew-termux')
  for (const folder of [home, bin, source]) await fs.mkdir(folder)
  await fs.writeFile(path.join(source, 'package-lock.json'), '{}')
  await fs.writeFile(path.join(source, 'mew'), 'test -t 0 && test "$1" = setup && printf "setup\n" >> setup.log\n')
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
  const run = (overrides = {}) => exec('script', ['-qec', 'cat "$TEST_INSTALLER" | bash', '/dev/null'], {
    env: {
      ...process.env, HOME: home, PATH: bin + ':' + process.env.PATH, TEST_INSTALLER: installer,
      TEST_ARCHIVE: archive, ...overrides,
    },
  })

  await assert.rejects(run({ TEST_OS: 'GNU/Linux' }), error => /native Termux/.test(error.stdout))
  await assert.rejects(run({ TEST_ARCHIVE: installer }), error => /checksum verification failed/.test(error.stdout))
  await assert.rejects(fs.stat(destination), { code: 'ENOENT' })
  await fs.mkdir(destination, { recursive: true })
  await fs.writeFile(path.join(destination, 'user-file'), 'keep')
  await assert.rejects(run(), error => /Preserving an existing/.test(error.stdout))
  assert.equal(await fs.readFile(path.join(destination, 'user-file'), 'utf8'), 'keep')
  await fs.rm(destination, { recursive: true })

  await run()
  await run({ TEST_ARCHIVE: '/missing' })
  assert.equal(await fs.readFile(path.join(destination, 'setup.log'), 'utf8'), 'setup\nsetup\n')
  await assert.rejects(fs.stat(destination + '.lock'), { code: 'ENOENT' })
})
