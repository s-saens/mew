import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import type { SpawnSpec } from './agentRuntimes.ts'
import { installHermes } from './installHermes.ts'

test('Hermes runs the ACP package installer with the existing uv', async () => {
  const steps: SpawnSpec[] = []
  await installHermes(() => 'fixture-uv', async spec => { steps.push(spec) })
  assert.deepEqual(steps, [{ cmd: 'fixture-uv', args: ['tool', 'install', '--force', 'hermes-agent[acp]'] }])
})

test('Hermes prepares uv in the Mew data directory when it is missing', async () => {
  const steps: SpawnSpec[] = []
  await installHermes(() => steps.length ? 'managed-uv' : null, async spec => { steps.push(spec) })
  const [bootstrap, install] = steps
  assert.ok(bootstrap.args.join(' ').includes(`https://astral.sh/uv/install.${process.platform === 'win32' ? 'ps1' : 'sh'}`))
  assert.ok(bootstrap.env?.UV_UNMANAGED_INSTALL?.endsWith(path.join('runtimes', 'uv')))
  assert.equal(install.cmd, 'managed-uv')
  await assert.rejects(installHermes(() => null, async () => {}), /uv 설치 후 실행 파일/)
})
