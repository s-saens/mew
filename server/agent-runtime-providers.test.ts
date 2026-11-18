import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { after, type TestContext } from 'node:test'

const fixtures = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-runtime-providers-'))
process.env.MEW_DATA_DIR = path.join(fixtures, 'data')
const {
  CODEX_ACP_PACKAGE, DEFAULT_CODEX_ACP_CMD, LEGACY_OPENCODE_NPM_PACKAGE, RUNTIMES,
  executableCandidates, findRuntimeExecutable, npmAgentInstallSpec, resolvedSpec, runtimeInstallationCommand,
  runtimeLoginSpec, runtimeNpmBin, runtimeNpmPackageRoot, runtimeNpmPrefix,
} = await import('./agentRuntimes.ts')
const { cursorInstallDirectories, cursorInstallSpec, cursorUpdateSpec } = await import('./cursorCliInstall.ts')
const { execHostFile } = await import('./platform/process.ts')
const { codexInstallSteps, installNpmAgentRuntime } = await import('./installNpmAgentRuntime.ts')
after(() => fs.rmSync(fixtures, { recursive: true, force: true }))

function isolatedPath(t: TestContext, directory: string) {
  const previousPath = process.env.PATH
  process.env.PATH = directory
  t.after(() => {
    if (previousPath === undefined) delete process.env.PATH
    else process.env.PATH = previousPath
  })
}

test('managed npm executable is usable with a service PATH containing a broken entry', t => {
  const serviceBin = path.join(fixtures, 'system bin')
  isolatedPath(t, serviceBin)
  const unusable = executableCandidates('kimi')[0]
  fs.mkdirSync(unusable, { recursive: true })
  const bin = runtimeNpmBin('kimi')
  fs.mkdirSync(bin, { recursive: true })
  const command = executableCandidates('kimi', { PATH: bin })[0]
  fs.writeFileSync(command, 'fixture', { mode: 0o700 })

  assert.equal(runtimeInstallationCommand('kimi'), 'kimi')
  assert.equal(findRuntimeExecutable('kimi', 'kimi'), command)
  assert.equal(resolvedSpec('kimi')?.cmd, command)
  assert.equal(runtimeLoginSpec('kimi').cmd, command)
  assert.equal(resolvedSpec('kimi')?.env?.PATH?.split(path.delimiter)[0], path.dirname(process.execPath))
  assert.deepEqual(RUNTIMES.kimi.uninstall?.().args, ['uninstall', '-g', '--prefix', runtimeNpmPrefix('kimi'), '@moonshot-ai/kimi-code'])
  assert.notEqual(runtimeNpmPrefix('kimi'), runtimeNpmPrefix('opencode'))
  assert.equal(runtimeNpmPackageRoot(runtimeNpmPrefix('kimi')), path.join(runtimeNpmPrefix('kimi'), ...(process.platform === 'win32' ? [] : ['lib']), 'node_modules'))
})

test('Codex repair installs only missing default host and adapter components', t => {
  for (const key of ['CODEX_PATH', 'MEW_AGENT_CODEX_CLI_CMD', 'MEW_AGENT_CODEX_CMD']) {
    const value = process.env[key]
    delete process.env[key]
    t.after(() => { if (value !== undefined) process.env[key] = value })
  }
  const managedBin = runtimeNpmBin('codex')
  const host = executableCandidates('codex', { PATH: managedBin })[0]
  const existing = new Set<string>([DEFAULT_CODEX_ACP_CMD])
  t.mock.method(fs, 'accessSync', (file: fs.PathLike) => {
    if (!existing.has(String(file))) throw new Error('fixture executable missing')
  })
  t.mock.method(fs, 'statSync', () => ({ isFile: () => true }))
  t.mock.method(fs, 'realpathSync', (file: fs.PathLike) => String(file))
  isolatedPath(t, path.join(fixtures, 'codex-path'))

  assert.deepEqual(codexInstallSteps(), { host: true })
  existing.add(host)
  assert.deepEqual(codexInstallSteps(), { host: false })
  assert.equal(resolvedSpec('codex')?.env?.CODEX_PATH, host)
  assert.equal(runtimeLoginSpec('codex').cmd, host)
  existing.delete(DEFAULT_CODEX_ACP_CMD)
  const repair = codexInstallSteps()
  assert.equal(repair.host, false)
  assert.deepEqual(repair.connector?.args, ['install', '--no-save', CODEX_ACP_PACKAGE])
})

test('npm update command retains the selected package and prefix and rejects mismatched packages', async () => {
  const prefix = path.join(fixtures, 'original npm prefix')
  const spec = npmAgentInstallSpec('opencode', prefix, LEGACY_OPENCODE_NPM_PACKAGE)
  assert.equal(spec.cmd, process.execPath)
  assert.deepEqual(spec.args.slice(1), ['opencode', prefix, 'opencode-ai'])
  await assert.rejects(installNpmAgentRuntime('opencode', prefix, 'unregistered-name'), /등록되지 않은/)
})

test('OpenCode removal respects the npm package referenced by a Windows command shim', t => {
  const original = process.env.MEW_AGENT_OPENCODE_CMD
  const shim = path.join(fixtures, 'opencode.cmd')
  process.env.MEW_AGENT_OPENCODE_CMD = shim
  t.after(() => {
    if (original === undefined) delete process.env.MEW_AGENT_OPENCODE_CMD
    else process.env.MEW_AGENT_OPENCODE_CMD = original
  })
  fs.writeFileSync(shim, '@"%dp0%\\node_modules\\@opencode\\cli\\bin\\opencode.exe" %*\n', { mode: 0o700 })
  assert.deepEqual(RUNTIMES.opencode.uninstall?.().args, ['uninstall', '-g', '@opencode/cli'])
  fs.writeFileSync(shim, '@"%dp0%\\node_modules\\opencode-ai\\bin\\opencode.exe" %*\n')
  assert.deepEqual(RUNTIMES.opencode.uninstall?.().args, ['uninstall', '-g', 'opencode-ai'])
})

test('the native Cursor installer preserves existing files and allows a clean retry', t => {
  const original = process.env.LOCALAPPDATA
  process.env.LOCALAPPDATA = path.join(fixtures, 'local-app-data')
  t.after(() => {
    if (original === undefined) delete process.env.LOCALAPPDATA
    else process.env.LOCALAPPDATA = original
  })
  const [root] = cursorInstallDirectories(fixtures, 'win32')
  const versionDirectory = path.join(root, 'versions')
  assert.match(cursorInstallSpec(fixtures, 'win32').args.at(-1) ?? '', /install\?win32=true/)
  fs.mkdirSync(versionDirectory, { recursive: true })
  assert.doesNotThrow(() => cursorInstallSpec(fixtures, 'win32'))
  const existing = path.join(versionDirectory, 'existing-asset')
  fs.writeFileSync(existing, 'preserve me')
  assert.throws(() => cursorInstallSpec(fixtures, 'win32'), /기존 Cursor 설치를 보존/)
  assert.equal(fs.readFileSync(existing, 'utf8'), 'preserve me')
})

test('the standard Unix Cursor update uses the public installer and reports download failures', { skip: process.platform === 'win32' }, async () => {
  const home = path.join(fixtures, 'cursor-home')
  const bin = path.join(home, '.local', 'bin')
  const alias = path.join(bin, 'agent')
  const target = path.join(home, '.local', 'share', 'cursor-agent', 'versions', 'old', 'cursor-agent')
  fs.mkdirSync(bin, { recursive: true })
  fs.symlinkSync(target, alias)
  const spec = cursorUpdateSpec(alias, home)
  assert.deepEqual(spec, cursorInstallSpec(home))
  assert.deepEqual(cursorUpdateSpec(target, home), { cmd: target, args: ['update'] })
  fs.writeFileSync(path.join(bin, 'curl'), '#!/bin/sh\nexit 22\n', { mode: 0o700 })
  await assert.rejects(execHostFile(spec.cmd, spec.args, {
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` }, timeout: 5000,
  }), { code: 22 })
  fs.writeFileSync(path.join(bin, 'cursor-agent'), 'unrelated program')
  assert.throws(() => cursorUpdateSpec(alias, home), /다른 실행 파일/)
})
