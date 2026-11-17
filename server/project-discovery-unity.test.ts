import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { discoverNestedProjects, discoverNestedProjectsAsync } from './project-registry.ts'

test('discovery skips generated Unity Library and Temp while preserving real project folders', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-unity-discovery-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const unity = path.join(root, 'unity')
  for (const dir of ['Assets', 'ProjectSettings', 'Library/generated/.mew', 'Temp/generated/.git', 'Assets/nested/.mew']) {
    fs.mkdirSync(path.join(unity, dir), { recursive: true })
  }
  fs.mkdirSync(path.join(root, 'regular', 'Library', 'actual-project', '.mew'), { recursive: true })
  const expected = [path.join(root, 'regular', 'Library', 'actual-project'), path.join(unity, 'Assets', 'nested')].sort()
  assert.deepEqual(discoverNestedProjects(root), expected)
  assert.deepEqual(await discoverNestedProjectsAsync(root), expected)
})
