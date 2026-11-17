import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { terminalGitBootstrap } from './terminal-git-bootstrap.ts'

test('tmux bootstrap installs account Git settings and removes inherited credentials', { skip: process.platform === 'win32' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-test-terminal-bootstrap-'))
  const shell = path.join(dir, 'shell')
  const previous = process.env.SHELL
  fs.writeFileSync(shell, '#!/bin/sh\nprintf "%s\\n" "$MEW_GIT_ACCOUNT_CAPABILITY_FILE" "$GIT_CONFIG_COUNT" "${GH_TOKEN-unset}" "${GIT_ASKPASS-unset}" "$GIT_AUTHOR_NAME"\n', { mode: 0o700 })
  process.env.SHELL = shell
  const bootstrap = terminalGitBootstrap({ GIT_CONFIG_COUNT: '2', GIT_AUTHOR_NAME: 'Mew owner', MEW_GIT_ACCOUNT_CAPABILITY_FILE: '/private/account-file' })
  try {
    assert.doesNotMatch(bootstrap.command, /private\/account-file/)
    const result = execFileSync('/bin/sh', ['-c', bootstrap.command], { encoding: 'utf8', env: { ...process.env, GH_TOKEN: 'wrong-token', GIT_ASKPASS: '/wrong', GIT_CONFIG_COUNT: '99', GIT_AUTHOR_NAME: 'Other user' } })
    assert.deepEqual(result.trim().split('\n'), ['/private/account-file', '2', 'unset', 'unset', 'Mew owner'])
    const file = /^exec \/bin\/sh '([^']+)'$/.exec(bootstrap.command)?.[1]
    assert.ok(file)
    assert.equal(fs.existsSync(file), false)
  } finally {
    bootstrap.cleanup()
    if (previous === undefined) delete process.env.SHELL
    else process.env.SHELL = previous
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
