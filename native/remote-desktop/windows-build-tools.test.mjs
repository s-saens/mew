import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { prepareWindowsBuildTools, windowsBuildEnvironment } from './windows-build-tools.mjs'
import { installWindowsNative } from './install-windows-native.mjs'
import { HELPER_FILES } from './helper-version.mjs'

const target = "C:\\Users\\Test User\\Mew's $(literal) helper"
const ready = () => ({
  architecture: 'x64', winget: 'C:\\WindowsApps\\winget.exe',
  environment: { Path: 'C:\\private-node;C:\\Cargo\\bin;C:\\CMake\\bin', LIBCLANG_PATH: 'C:\\LLVM\\bin', INCLUDE: 'C:\\SDK\\include', LIB: 'C:\\SDK\\lib' },
  tools: { visualStudio: true, cmake: 'C:\\CMake\\bin\\cmake.exe', clang: 'C:\\LLVM\\bin', perl: 'C:\\Strawberry\\perl\\bin\\perl.exe', rust: 'C:\\Cargo\\bin\\rustup.exe' },
})

function fixture(options = {}) {
  const state = ready(), calls = [], logs = []
  let probes = 0
  const prepare = (overrides = {}) => prepareWindowsBuildTools({
    target, env: { PATH: 'stale inherited WSL path', SystemRoot: 'C:\\Windows' }, log: line => logs.push(line),
    inspect: () => { probes++; return structuredClone(state) },
    run: (command, args, settings) => { calls.push({ command, args, settings }); return { status: 0 } },
    ...options, ...overrides,
  })
  return { state, calls, logs, prepare, probes: () => probes }
}

test('installed Windows tools are reused with refreshed PATH, SDK and explicit MSVC without global defaults', () => {
  const f = fixture()
  const result = f.prepare()
  assert.equal(f.probes(), 1)
  assert.deepEqual(f.calls.map(call => call.args), [
    ['run', 'stable-x86_64-pc-windows-msvc', 'rustc', '--version'],
    ['run', 'stable-x86_64-pc-windows-msvc', 'cargo', '--version'],
  ])
  assert.equal(result.env.Path, f.state.environment.Path)
  assert.equal(result.env.PATH, undefined)
  assert.equal(result.env.LIBCLANG_PATH, 'C:\\LLVM\\bin')
  assert.equal(result.env.INCLUDE, 'C:\\SDK\\include')
  assert.equal(result.env.RUSTUP_TOOLCHAIN, 'stable-x86_64-pc-windows-msvc')
  assert.ok(f.calls.every(call => call.settings.env.Path === result.env.Path))
  assert.ok(!f.calls.some(call => call.command === f.state.winget || call.args.includes('default')))
})

test('missing Windows Cargo is installed once and discovered in the same preparation despite stale inherited PATH', () => {
  const f = fixture()
  f.state.tools.rust = null
  const result = f.prepare({ run(command, args, settings) {
    f.calls.push({ command, args, settings })
    if (command === f.state.winget) f.state.tools.rust = 'C:\\Cargo\\bin\\rustup.exe'
    return { status: 0 }
  } })
  assert.equal(f.probes(), 2)
  assert.equal(f.calls.filter(call => call.command === f.state.winget).length, 1)
  assert.deepEqual(f.calls[0].args, ['install', '--exact', '--id', 'Rustlang.Rustup', '--source', 'winget', '--accept-source-agreements', '--accept-package-agreements', '--silent', '--disable-interactivity'])
  assert.equal(f.calls[0].settings.cwd, target)
  assert.equal(f.calls[1].command, f.state.tools.rust)
  assert.equal(result.env.RUSTUP_TOOLCHAIN, 'stable-x86_64-pc-windows-msvc')
})

test('only missing packages are installed, C++/SDK workload is requested and tools are rechecked after each install', () => {
  const f = fixture()
  f.state.architecture = 'arm64'
  f.state.tools = Object.fromEntries(Object.keys(f.state.tools).map(key => [key, null]))
  const expected = [
    ['visualStudio', 'Microsoft.VisualStudio.2022.BuildTools'], ['cmake', 'Kitware.CMake'],
    ['clang', 'LLVM.LLVM'], ['perl', 'StrawberryPerl.StrawberryPerl'], ['rust', 'Rustlang.Rustup'],
  ]
  let installed = 0
  const result = f.prepare({ run(command, args, settings) {
    f.calls.push({ command, args, settings })
    if (command === f.state.winget) {
      const [tool, id] = expected[installed++]
      assert.equal(args[args.indexOf('--id') + 1], id)
      f.state.tools[tool] = tool === 'rust' ? 'C:\\Cargo\\bin\\rustup.exe' : true
    }
    return { status: 0 }
  } })
  assert.equal(installed, 5)
  assert.equal(f.probes(), 6)
  assert.ok(f.calls[0].args.includes('--force'))
  assert.match(f.calls[0].args.at(-1), /--norestart.*Microsoft.VisualStudio.Workload.VCTools.*--includeRecommended.*VC.Tools.ARM64/)
  assert.ok(f.calls.every(call => !call.args.includes('--ignore-security-hash') && !call.args.includes('--allow-reboot')))
  assert.equal(result.env.RUSTUP_TOOLCHAIN, 'stable-aarch64-pc-windows-msvc')
})

test('Rust stable MSVC is installed when only another or incomplete toolchain is available', () => {
  for (const missing of ['rustc', 'cargo']) {
    const f = fixture()
    let installed = false
    f.prepare({ run(command, args, settings) {
      f.calls.push({ command, args, settings })
      if (args[0] === 'toolchain') installed = true
      return { status: !installed && args[2] === missing ? 1 : 0 }
    } })
    const install = f.calls.find(call => call.args[0] === 'toolchain')
    assert.deepEqual(install.args, ['toolchain', 'install', 'stable-x86_64-pc-windows-msvc', '--profile', 'minimal', '--no-self-update'])
    assert.deepEqual(f.calls.slice(-2).map(call => call.args[2]), ['rustc', 'cargo'])
    assert.ok(!f.calls.some(call => call.args.includes('default')))
  }
})

test('an existing partial Visual Studio Build Tools installation is modified at its discovered path', () => {
  const f = fixture()
  f.state.tools.visualStudio = false
  f.state.buildToolsPath = 'C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools'
  f.prepare({ run(command, args) {
    if (command === f.state.winget) {
      assert.match(args.at(-1), /^modify --installPath "C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools" --channelId VisualStudio\.17\.Release --wait/)
      assert.match(args.at(-1), /--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended/)
      f.state.tools.visualStudio = true
    }
    return { status: 0 }
  } })
})

test('missing WinGet, cancelled/failed installers and unavailable post-install tools block native compilation', () => {
  const f = fixture()
  f.state.tools.rust = null
  f.state.winget = null
  assert.throws(() => f.prepare(), /Rustlang.Rustup.*WinGet.*App Installer/)
  assert.equal(f.calls.length, 0)
  f.state.winget = 'winget.exe'
  for (const result of [{ status: 1602 }, { status: 3010 }, { status: null, signal: 'SIGTERM' }, { status: null, error: new Error('ENOENT') }]) {
    assert.throws(() => f.prepare({ run: () => result }), /Installing Rustlang.Rustup failed.*Approve Windows installation prompts/)
  }
  assert.throws(() => f.prepare(), /Rustlang.Rustup installation finished.*still unavailable/)
  f.state.tools = ready().tools
  assert.throws(() => f.prepare({ run: () => ({ status: 1 }) }), /Preparing Rust stable MSVC failed/)
})

test('the production discovery adapter refreshes each snapshot and rejects failed PowerShell before installation', () => {
  const f = fixture()
  let probes = 0
  f.prepare({ inspect: undefined, run(command, args, settings) {
    if (args.includes('-File')) {
      probes++
      assert.ok(command.endsWith('powershell.exe'))
      assert.ok(args.at(-1).endsWith('windows-build-environment.ps1'))
      assert.equal(settings.cwd, target)
      return { status: 0, stdout: '\uFEFF' + JSON.stringify(f.state), stderr: '' }
    }
    return { status: 0 }
  } })
  assert.equal(probes, 1)
  assert.throws(() => f.prepare({ inspect: undefined, run: () => ({ status: 1, stderr: 'SDK discovery failed' }) }), /Windows build tool discovery failed: SDK discovery failed/)
})

test('native compilation uses one prepared environment for GPU and Rust, and stops on every prerequisite failure', () => {
  const env = { Path: 'refreshed', RUSTUP_TOOLCHAIN: 'stable-x86_64-pc-windows-msvc' }, phases = [], calls = []
  const options = {
    target,
    prepare() { phases.push('prepare'); return { env, powershell: 'powershell.exe', rustup: 'C:\\Cargo\\bin\\rustup.exe', toolchain: env.RUSTUP_TOOLCHAIN } },
    run(command, args, settings) { calls.push({ command, args, settings }); return { status: 0 } },
    installEngine(settings) { phases.push('rust'); settings.run('cargo', ['build'], { cwd: target, stdio: 'inherit' }) },
  }
  installWindowsNative(options)
  assert.deepEqual(phases, ['prepare', 'rust'])
  assert.deepEqual(calls[0].args.slice(-2), ['-Target', target])
  assert.ok(calls[0].args.includes(path.join(target, 'install-windows-gpu.ps1')))
  assert.ok(calls.every(call => call.settings.env === env))
  assert.equal(calls[1].command, 'C:\\Cargo\\bin\\rustup.exe')
  assert.deepEqual(calls[1].args, ['run', env.RUSTUP_TOOLCHAIN, 'cargo', 'build'])
  for (const result of [{ status: 1 }, { status: null, error: new Error('ENOENT') }]) {
    assert.throws(() => installWindowsNative({ ...options, run: () => result, installEngine() { assert.fail('Rust must not build after GPU failure') } }), /Windows GPU module preparation failed/)
  }
  assert.throws(() => installWindowsNative({ ...options, prepare() { throw new Error('prerequisites missing') }, run() { assert.fail('GPU must not build before prerequisites') } }), /prerequisites missing/)
})

test('Windows helper copies and hashes preparation files and marks ready only after native compilation', () => {
  for (const file of ['install-windows-native.mjs', 'windows-build-tools.mjs', 'windows-build-environment.ps1']) assert.ok(HELPER_FILES.includes(file))
  const script = readFileSync(new URL('./install.ps1', import.meta.url), 'utf8')
  assert.ok(script.indexOf('install-windows-native.mjs') < script.indexOf("'helper-version.mjs') mark"))
  assert.match(script, /if \(\$LASTEXITCODE -ne 0\) \{ throw 'Windows desktop native module preparation failed/)
})

test('Windows build environment replaces case-insensitive keys and preserves unrelated variables', () => {
  assert.deepEqual(windowsBuildEnvironment({ PATH: 'old', libclang_path: 'old', KEEP: 'value' }, { Path: 'new', LIBCLANG_PATH: 'new' }), { KEEP: 'value', Path: 'new', LIBCLANG_PATH: 'new' })
})

const windowsPowerShell = process.platform === 'win32'
  ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
  : '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
test('real Windows PowerShell parses setup scripts and discovers tools without installing or capturing', {
  skip: !existsSync(windowsPowerShell), timeout: 60_000,
}, () => {
  const windowsPath = file => process.platform === 'win32' ? file : execFileSync('wslpath', ['-w', file], { encoding: 'utf8' }).trim()
  for (const file of ['install.ps1', 'windows-build-environment.ps1']) {
    const source = windowsPath(fileURLToPath(new URL(file, import.meta.url))).replaceAll("'", "''")
    const script = `$tokens=$null;$errors=$null;[void][Management.Automation.Language.Parser]::ParseFile('${source}',[ref]$tokens,[ref]$errors);if($errors.Count){throw ($errors | Out-String)}`
    const result = spawnSync(windowsPowerShell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8', timeout: 15_000 })
    assert.equal(result.status, 0, result.stderr)
  }
  const result = spawnSync(windowsPowerShell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', windowsPath(fileURLToPath(new URL('windows-build-environment.ps1', import.meta.url)))], { encoding: 'utf8', timeout: 45_000 })
  assert.equal(result.status, 0, result.stderr)
  assert.doesNotMatch(result.stderr, /not recognized as an internal or external command/)
  const state = JSON.parse(result.stdout.replace(/^\uFEFF/, '').trim())
  assert.ok(['x64', 'arm64'].includes(state.architecture))
  assert.equal(typeof state.tools.visualStudio, 'boolean')
  assert.ok(state.environment.Path)
  assert.ok(!Object.keys(state.environment).some(key => /token|password|secret/i.test(key)))
})
