import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { openClawInstallSpec } from './installOpenClaw.ts'
import type { execHostFile } from './platform/process.ts'

const current = path.resolve('system node')
const alternate = path.resolve('compatible node')
const prefix = path.resolve('npm global')
const env = { PATH: [current, alternate].join(path.delimiter) }

function fixture(
  nodeVersions: Record<string, string>,
  npmVersion = '11.13.0',
  ignoreScripts = 'false',
) {
  const calls: { cmd: string; args: string[]; path?: string }[] = []
  const run: typeof execHostFile = async (cmd, args, options) => {
    const searchPath = options?.env?.PATH
    calls.push({ cmd, args, path: searchPath })
    assert.ok(options?.timeout && options.timeout <= 5000)
    let stdout: string | undefined
    if (cmd !== 'npm') stdout = nodeVersions[path.dirname(cmd)]
    else if (args[0] === 'prefix') stdout = prefix
    else if (args[0] === 'config') stdout = ignoreScripts
    else if (args[0] === '--version') stdout = npmVersion
    if (!stdout) throw new Error('Fixture command missing')
    return { stdout: stdout + '\n', stderr: '' }
  }
  return { calls, run }
}

test('OpenClaw retries npm with an available compatible Node and retains the original npm prefix', async () => {
  const { run, calls } = fixture({ [current]: 'v22.22.2', [alternate]: 'v24.16.0' })
  const spec = await openClawInstallSpec({ env, run })
  assert.equal(spec.cmd, 'npm')
  assert.equal(spec.env?.PATH?.split(path.delimiter)[0], alternate)
  assert.deepEqual(spec.args, ['install', '-g', '--prefix', prefix, 'openclaw@latest', '--no-audit', '--no-fund'])
  assert.deepEqual(calls.find(call => call.cmd === 'npm' && call.args[0] === 'prefix')?.path, env.PATH)
  assert.equal(calls.find(call => call.cmd === 'npm' && call.args[0] === '--version')?.path, spec.env?.PATH)
})

test('OpenClaw uses the prefix supplied by update discovery and only opts in to lifecycle scripts on supported npm', async () => {
  for (const [npmVersion, allowScripts] of [['11.15.0', false], ['11.16.0', true], ['12.2.3', true]] as const) {
    const { run, calls } = fixture({ [current]: 'v26.1.0' }, npmVersion)
    const spec = await openClawInstallSpec({ env, prefix, run })
    assert.equal(calls.some(call => call.args[0] === 'prefix'), false)
    assert.deepEqual(spec.args.slice(2, 4), ['--prefix', prefix])
    assert.equal(spec.args.includes('--allow-scripts=openclaw'), allowScripts)
  }
})

test('OpenClaw applies the vendor Node release floors before invoking npm', async () => {
  const versions = [
    ['v24.15.9', false], ['v24.16.0-rc.1', false], ['v24.16.0', true],
    ['v25.9.0', false], ['v26.0.9', false], ['v26.1.0', true],
    ['v27.0.0-nightly20261018f88a1d25e9', true],
  ] as const
  for (const [version, accepted] of versions) {
    const { run, calls } = fixture({ [current]: version })
    if (accepted) await openClawInstallSpec({ env, prefix, run })
    else {
      await assert.rejects(openClawInstallSpec({ env, prefix, run }), /24\.16\.0.*26\.1\.0.*PATH/)
      assert.equal(calls.some(call => call.cmd === 'npm'), false)
    }
  }
})

test('OpenClaw explains when the existing npm policy disables installation scripts', async () => {
  const { run } = fixture({ [current]: 'v24.16.0' }, '12.2.3', 'true')
  await assert.rejects(openClawInstallSpec({ env, run }), /ignore-scripts/)
})

test('the OpenClaw installer forwards npm stdout and stderr and reports nonzero exit', { skip: process.platform === 'win32' }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-openclaw-install-'))
  try {
    const bin = path.join(directory, 'fixtures')
    await fs.mkdir(bin)
    await fs.writeFile(path.join(bin, 'node'), '#!/bin/sh\nprintf "%s\\n" v24.16.0\n', { mode: 0o700 })
    await fs.writeFile(path.join(bin, 'npm'), `#!/bin/sh
case "$1" in
  --version) printf '%s\\n' 11.13.0 ;;
  config) printf '%s\\n' false ;;
  install)
    printf '%s\\n' 'npm fixture progress'
    printf '%s\\n' 'npm fixture failure' >&2
    exit 7 ;;
  *) exit 99 ;;
esac
`, { mode: 0o700 })
    const script = fileURLToPath(new URL('./installOpenClaw.ts', import.meta.url))
    await assert.rejects(
      promisify(execFile)(process.execPath, [script, path.join(directory, 'npm prefix')], {
        env: { ...process.env, PATH: bin },
        timeout: 15_000,
      }),
      (error: { code?: number; stdout?: string; stderr?: string }) => {
        assert.equal(error.code, 1)
        assert.match(error.stdout ?? '', /npm fixture progress/)
        assert.match(error.stderr ?? '', /npm fixture failure/)
        assert.match(error.stderr ?? '', /OpenClaw.*\(7\)/)
        return true
      },
    )
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
