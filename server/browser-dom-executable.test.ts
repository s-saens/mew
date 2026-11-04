import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { domBrowserExecutable } from './browser-dom-executable.ts'

test('discovers Obscura from PATH, user bin symlink, and versioned install directories while verifying obscura-worker', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-obscura-'))
  t.after(() => fs.rm(home, { recursive: true, force: true }))
  const makeExecutable = async (file: string) => {
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, '#!/bin/sh\nexit 0\n', { mode: 0o700 })
  }

  const v25 = path.join(home, '.local/share/obscura/v0.2.5/obscura')
  const v26 = path.join(home, '.local/share/obscura/v0.2.6/obscura')
  await makeExecutable(v25)
  await makeExecutable(path.join(path.dirname(v25), 'obscura-worker'))
  assert.equal(domBrowserExecutable({ env: { PATH: '' }, home }), v25)

  // A newer directory without obscura-worker is skipped in favor of a complete install.
  await makeExecutable(v26)
  assert.equal(domBrowserExecutable({ env: { PATH: '' }, home }), v25)
  await makeExecutable(path.join(path.dirname(v26), 'obscura-worker'))
  assert.equal(domBrowserExecutable({ env: { PATH: '' }, home }), v26)

  // A symlink in ~/.local/bin/obscura resolves its target directory's obscura-worker.
  const localBin = path.join(home, '.local/bin/obscura')
  await fs.mkdir(path.dirname(localBin), { recursive: true })
  await fs.symlink(v26, localBin)
  assert.equal(domBrowserExecutable({ env: { PATH: '' }, home }), localBin)

  // PATH entry takes priority when valid.
  const customDir = path.join(home, 'custom bin')
  const customObscura = path.join(customDir, 'obscura')
  await makeExecutable(customObscura)
  await makeExecutable(path.join(customDir, 'obscura-worker'))
  assert.equal(domBrowserExecutable({ env: { PATH: customDir }, home }), customObscura)

  // Explicit overrides take highest priority and validate executable path.
  const override = path.join(home, 'override/obscura')
  await makeExecutable(override)
  assert.equal(domBrowserExecutable({ env: { PATH: customDir, MEW_DOM_BROWSER_EXECUTABLE: override }, home }), override)
  assert.equal(domBrowserExecutable({ env: { PATH: customDir, MEW_BROWSER_EXECUTABLE: override }, home }), override)

  for (const explicit of [path.join(home, 'missing'), home, './obscura']) {
    assert.throws(() => domBrowserExecutable({ env: { MEW_BROWSER_EXECUTABLE: explicit }, home }), /MEW_BROWSER_EXECUTABLE/)
    assert.throws(() => domBrowserExecutable({ env: { MEW_DOM_BROWSER_EXECUTABLE: explicit }, home }), /MEW_DOM_BROWSER_EXECUTABLE/)
  }
})

