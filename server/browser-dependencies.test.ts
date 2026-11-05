import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile, type spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { ensureBrowserDependencies, runBrowserDependencyCommand, type BrowserDependencyOptions } from './browser-dependencies.ts'
import { configFiles, loadConfigEnvironment } from './config-environment.ts'

type Services = NonNullable<BrowserDependencyOptions['dependencies']>

function fixture(options: { chrome?: boolean; chromium?: boolean; shell?: boolean; missingLibraries?: boolean; persistentMissing?: boolean; failInstall?: boolean } = {}) {
  const env = { PLAYWRIGHT_BROWSERS_PATH: '/fixture/custom-playwright' }
  const paths = { chrome: '/fixture/google/chrome', chromium: '/fixture/custom-playwright/chromium', headlessShell: '/fixture/custom-playwright/headless-shell' }
  const available = new Set<string>()
  if (options.chrome ?? true) available.add(paths.chrome)
  if (options.chromium ?? true) available.add(paths.chromium)
  if (options.shell ?? true) available.add(paths.headlessShell)
  let missing = options.missingLibraries ?? false
  const calls: { command: string; args: string[]; options: { env: NodeJS.ProcessEnv; inheritOutput?: boolean } }[] = []
  const dependencies: Services = {
    resolveChrome: () => available.has(paths.chrome) ? paths.chrome : undefined,
    resolveChromium: () => '/fixture/system-chromium',
    pinnedPaths: async selectedEnv => { assert.equal(selectedEnv, env); return paths },
    executable: async file => available.has(file),
    libraryBinary: async file => file,
    run: async (command, args, runOptions) => {
      calls.push({ command, args, options: runOptions })
      assert.equal(runOptions.env, env, 'every subprocess receives the supplied environment')
      if (command === 'ldd') return { code: 0, stdout: missing ? ' libnss3.so => not found\n' : 'libc.so.6 => /lib/libc.so.6\n', stderr: '' }
      assert.equal(command, process.execPath)
      assert.match(args[0]!, /playwright-core[/\\]cli\.js$/)
      assert.equal(runOptions.inheritOutput, true)
      if (options.failInstall) return { code: 1, stdout: '', stderr: 'fixture installation failure' }
      if (args[1] === 'install' && args[2] === 'chromium') { available.add(paths.chromium); available.add(paths.headlessShell) }
      if (args[1] === 'install' && args[2] === 'chrome') available.add(paths.chrome)
      if (args[1] === 'install-deps' && !options.persistentMissing) missing = false
      return { code: 0, stdout: '', stderr: '' }
    },
  }
  const ensure = (extra: BrowserDependencyOptions = {}) => ensureBrowserDependencies({ env, platform: 'linux', arch: 'x64', dependencies, ...extra })
  return { ensure, env, paths, calls, available, dependencies }
}

const installers = (calls: ReturnType<typeof fixture>['calls']) => calls.filter(call => call.command !== 'ldd')

test('ready browsers pass read-only checks and repeated setup without running installers', async () => {
  const f = fixture()
  assert.deepEqual(await f.ensure({ install: false }), { chrome: f.paths.chrome, chromium: f.paths.chromium })
  await f.ensure()
  assert.equal(installers(f.calls).length, 0)
})

test('default setup installs pinned Chromium and its headless shell without replacing installed Chrome', async () => {
  const f = fixture({ chromium: false, shell: false })
  assert.deepEqual(await f.ensure(), { chrome: f.paths.chrome, chromium: f.paths.chromium })
  assert.deepEqual(installers(f.calls).map(call => call.args.slice(1)), [['install', 'chromium']])
  assert.ok(f.available.has(f.paths.headlessShell))
})

test('a missing headless shell repairs the pinned Chromium installation', async () => {
  const f = fixture({ shell: false })
  await f.ensure()
  assert.deepEqual(installers(f.calls).map(call => call.args.slice(1)), [['install', 'chromium']])
})

test('ordinary Chrome is installed only when discovery reports it absent', async () => {
  const f = fixture({ chrome: false })
  await f.ensure()
  await f.ensure()
  assert.deepEqual(installers(f.calls).map(call => call.args.slice(1)), [['install', 'chrome']])
  assert.ok(!installers(f.calls).some(call => call.args.includes('--force')))
})

test('system Chromium does not satisfy the pinned default and check mode never installs', async () => {
  const f = fixture({ chromium: false, shell: false, chrome: false })
  await assert.rejects(f.ensure({ install: false }), /pinned Playwright Chromium.*Google Chrome.*browsers:install/)
  assert.equal(f.calls.length, 0)
})

test('valid role overrides avoid pinned downloads and legacy compatibility remains available', async () => {
  const fail = async () => { assert.fail('valid overrides must not require downloads or path probes') }
  for (const env of [
    { MEW_CHROME_EXECUTABLE: process.execPath, MEW_CHROMIUM_EXECUTABLE: process.execPath },
    { MEW_BROWSER_EXECUTABLE: process.execPath },
  ]) {
    const result = await ensureBrowserDependencies({ env, platform: 'darwin', install: false, dependencies: { executable: async () => true, run: fail, pinnedPaths: fail } })
    assert.deepEqual(result, { chrome: process.execPath, chromium: process.execPath })
  }
})

test('invalid explicit paths are rejected before any installer or path subprocess runs', async () => {
  const fail = async () => { assert.fail('invalid overrides must not run subprocesses') }
  for (const env of [
    { MEW_CHROME_EXECUTABLE: './invalid-chrome' },
    { MEW_CHROME_EXECUTABLE: process.execPath, MEW_CHROMIUM_EXECUTABLE: './invalid-chromium' },
    { MEW_BROWSER_EXECUTABLE: './invalid-legacy' },
  ]) {
    await assert.rejects(ensureBrowserDependencies({ env, dependencies: { run: fail, pinnedPaths: fail } }), /MEW_(CHROME|CHROMIUM|BROWSER)_EXECUTABLE/)
  }
})

test('missing Linux native libraries trigger one dependency install and are rechecked', async () => {
  const f = fixture({ missingLibraries: true })
  await f.ensure()
  assert.deepEqual(installers(f.calls).map(call => call.args.slice(1)), [['install-deps', 'chromium']])
  await f.ensure()
  assert.equal(installers(f.calls).length, 1)
})

test('read-only checks report missing native libraries without apt or installers', async () => {
  const f = fixture({ missingLibraries: true })
  await assert.rejects(f.ensure({ install: false }), /libnss3\.so.*browsers:install/)
  assert.equal(installers(f.calls).length, 0)
})

test('unresolved native dependencies and unexpected ldd errors fail honestly', async () => {
  const f = fixture({ missingLibraries: true, persistentMissing: true })
  await assert.rejects(f.ensure(), /Missing browser native libraries/)
  assert.equal(installers(f.calls).length, 1)
  const broken = fixture()
  broken.dependencies.run = async () => ({ code: 1, stdout: '', stderr: 'invalid ELF' })
  await assert.rejects(broken.ensure(), /Cannot inspect.*ldd/)
})

test('Linux non-x64 missing Chrome gives manual installation guidance before mutation', async () => {
  const f = fixture({ chrome: false, chromium: false })
  await assert.rejects(f.ensure({ arch: 'arm64' }), /Linux x64.*arm64.*MEW_CHROME_EXECUTABLE/)
  assert.equal(f.calls.length, 0)
})

test('macOS and Windows install the same pinned prerequisites without Linux apt checks', async () => {
  for (const platform of ['darwin', 'win32'] as const) {
    const f = fixture({ chromium: false, shell: false, chrome: false })
    await f.ensure({ platform })
    assert.deepEqual(f.calls.map(call => call.args.slice(1)), [['install', 'chromium'], ['install', 'chrome']])
  }
})

test('installer failures retain an actionable retry instruction', async () => {
  const f = fixture({ chromium: false, failInstall: true })
  await assert.rejects(f.ensure(), /installation failed.*install chromium.*sudo.*browsers:install/)
})

test('environment loading reads existing host settings then application settings without creating paths', () => {
  const files = configFiles({ configDirectory: '/fixture/config', appRoot: '/fixture/app' })
  assert.deepEqual(files, [path.join('/fixture/config', 'config.env'), path.join('/fixture/app', '.env')])
  const loaded: string[] = []
  loadConfigEnvironment({ files, exists: () => true, load: file => { loaded.push(file) } })
  assert.deepEqual(loaded, files)
  loaded.length = 0
  loadConfigEnvironment({ files, exists: file => file.endsWith('.env') && !file.endsWith('config.env'), load: file => { loaded.push(file) } })
  assert.deepEqual(loaded, [files[1]])
})

test('the real manager CLI honors configured browser overrides before read-only checking', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-browser-config-check-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const configuration = path.join(directory, 'mew', ...(process.platform === 'win32' ? ['config'] : []))
  await fs.mkdir(configuration, { recursive: true })
  await fs.writeFile(path.join(configuration, 'config.env'), 'MEW_CHROME_EXECUTABLE=./fixture-invalid-chrome\n')
  const env: NodeJS.ProcessEnv = { ...process.env, XDG_CONFIG_HOME: directory, LOCALAPPDATA: directory, MEW_DATA_DIR: path.join(directory, 'untouched-data') }
  for (const key of ['MEW_CHROME_EXECUTABLE', 'MEW_CHROMIUM_EXECUTABLE', 'MEW_BROWSER_EXECUTABLE']) delete env[key]
  await assert.rejects(promisify(execFile)(process.execPath, [fileURLToPath(new URL('./browser-dependencies.ts', import.meta.url)), '--check'], { env }), error => {
    assert.match((error as Error & { stderr: string }).stderr, /MEW_CHROME_EXECUTABLE/)
    return true
  })
  await assert.rejects(fs.stat(env.MEW_DATA_DIR!), { code: 'ENOENT' })
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  test(`dependency subprocess forwards ${signal}, waits for close, and removes signal handlers`, async () => {
    const before = ['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name))
    const killed: string[] = []
    const child = Object.assign(new EventEmitter(), { kill: (value: string) => { killed.push(value); return true }, stdout: null, stderr: null })
    const operation = runBrowserDependencyCommand('fixture-installer', [], { env: {}, inheritOutput: true }, (() => child) as unknown as typeof spawn)
    const rejection = assert.rejects(operation, error => {
      assert.ok(error instanceof Error)
      assert.equal(error.name, 'AbortError')
      assert.equal((error as Error & { signal: string }).signal, signal)
      return true
    })
    const handler = process.listeners(signal).at(-1) as () => void
    handler()
    assert.deepEqual(killed, [signal])
    assert.equal(process.listenerCount(signal), before[signal === 'SIGINT' ? 0 : 1]! + 1, 'handler stays until child close')
    child.emit('close', 0)
    await rejection
    assert.deepEqual(['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name)), before)
  })
}

test('dependency subprocess spawn failures clean up handlers after close', async () => {
  const before = ['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name))
  const child = Object.assign(new EventEmitter(), { stdout: null, stderr: null })
  const operation = runBrowserDependencyCommand('fixture-installer', [], { env: {} }, (() => child) as unknown as typeof spawn)
  const rejection = assert.rejects(operation, /fixture cannot spawn/)
  child.emit('error', new Error('fixture cannot spawn'))
  child.emit('close', -1)
  await rejection
  assert.deepEqual(['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name)), before)
})
