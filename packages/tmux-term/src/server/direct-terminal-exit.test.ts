import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createDirectTerminal } from './direct-terminal.ts'

test('direct shell exit invokes its cleanup hook', { skip: process.platform === 'win32', timeout: 5000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-terminal-exit-'))
  const shell = path.join(dir, 'shell')
  const previous = process.env.SHELL
  fs.writeFileSync(shell, '#!/bin/sh\nexit 0\n', { mode: 0o700 })
  process.env.SHELL = shell
  try {
    let cleaned = false
    await new Promise<void>(resolve => createDirectTerminal('mewdirect-exit-fixture', 'shell', dir, process.env, () => { cleaned = true; resolve() }))
    assert.equal(cleaned, true)
  } finally {
    if (previous === undefined) delete process.env.SHELL
    else process.env.SHELL = previous
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
