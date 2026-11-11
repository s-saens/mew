import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

test('account credential revocation removes scoped delivery connections in isolated installation data', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-release-account-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const root = path.join(directory, 'project')
  fs.mkdirSync(root)
  const source = `
    import assert from 'node:assert/strict';
    import { upsertUser, revokeAccountCredentials } from ${JSON.stringify(new URL('./auth.ts', import.meta.url).href)};
    import { releaseProvidersService } from ${JSON.stringify(new URL('./release-providers.ts', import.meta.url).href)};
    const owner = 'release-owner@example.test', root = ${JSON.stringify(root)};
    upsertUser(owner, { hash: 'fixture', role: 'owner', mustChangePassword: false, createdAt: 100, passwordChangedAt: 100 });
    releaseProvidersService.save(root, owner, { config: { provider: 'github-actions', label: 'Website', owner: 'example', repo: 'site', workflow: 'publish.yml', ref: 'main' }, token: 'synthetic-token' });
    assert.equal(releaseProvidersService.state(root, owner).connections.length, 1);
    revokeAccountCredentials(owner);
    assert.equal(releaseProvidersService.state(root, owner).connections.length, 0);
  `
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    env: { ...process.env, MEW_DATA_DIR: path.join(directory, 'private') }, encoding: 'utf8', timeout: 15_000,
  })
  assert.equal(child.status, 0, child.stderr)
})
