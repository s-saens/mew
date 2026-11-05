import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = path.dirname(fileURLToPath(import.meta.url))
const packages = [
  ['visualStudio', 'Microsoft.VisualStudio.2022.BuildTools'],
  ['cmake', 'Kitware.CMake'],
  ['clang', 'LLVM.LLVM'],
  ['perl', 'StrawberryPerl.StrawberryPerl'],
  ['rust', 'Rustlang.Rustup'],
]

// Windows environment names are case insensitive, including PATH/Path.
export function windowsBuildEnvironment(original, additions) {
  const replaced = new Set(Object.keys(additions).map(key => key.toUpperCase()))
  return { ...Object.fromEntries(Object.entries(original).filter(([key]) => !replaced.has(key.toUpperCase()))), ...additions }
}

export function prepareWindowsBuildTools({ target, env = process.env, run = spawnSync, log = console.log, inspect } = {}) {
  const powershell = path.win32.join(env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const probe = inspect || (() => {
    const result = run(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(directory, 'windows-build-environment.ps1')], { cwd: target, env, encoding: 'utf8', timeout: 60_000, windowsHide: true })
    if (result.error || result.status !== 0) throw new Error(`Windows build tool discovery failed: ${result.error?.message || result.stderr || result.status}`)
    return JSON.parse(result.stdout.replace(/^\uFEFF/, '').trim())
  })
  let state = probe()
  if (!['x64', 'arm64'].includes(state.architecture)) throw new Error('Windows remote desktop requires x64 or arm64 build tools.')
  const execute = (command, args, phase, timeout = 30 * 60_000) => {
    const result = run(command, args, { cwd: target, env: windowsBuildEnvironment(env, state.environment), stdio: 'inherit', timeout })
    if (result.error || result.status !== 0) {
      const detail = result.error?.message || (result.signal ? `signal ${result.signal}` : `exit code ${result.status}`)
      throw new Error(`${phase} failed (${detail}). Approve Windows installation prompts on the host, resolve any required restart, then retry remote desktop preparation.`)
    }
  }
  log('Checking Windows desktop build tools; missing tools will be installed with WinGet. Approve any Windows installation prompts on the host.')
  for (const [tool, id] of packages) {
    if (state.tools[tool]) continue
    if (!state.winget) throw new Error(`Windows build tool ${id} is missing, and WinGet is unavailable. Install or update Microsoft's App Installer on Windows, or install the missing build tools manually, then retry preparation.`)
    log(`Installing missing Windows build tool: ${id}...`)
    const args = ['install', '--exact', '--id', id, '--source', 'winget', '--accept-source-agreements', '--accept-package-agreements', '--silent', '--disable-interactivity']
    if (tool === 'visualStudio') {
      let options = '--wait --passive --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended'
      if (state.architecture === 'arm64') options += ' --add Microsoft.VisualStudio.Component.VC.Tools.ARM64'
      if (state.buildToolsPath) options = `modify --installPath "${state.buildToolsPath}" --channelId VisualStudio.17.Release ${options}`
      // --force also runs the workload installer when Build Tools is already
      // registered but its required C++/SDK components are missing.
      args.push('--force', '--override', options)
    }
    execute(state.winget, args, `Installing ${id}`, 60 * 60_000)
    state = probe()
    if (!state.tools[tool]) throw new Error(`${id} installation finished, but the required Windows build tools are still unavailable. Check View Setup Details and the Windows installer, then retry preparation.`)
  }
  const toolchain = `stable-${state.architecture === 'arm64' ? 'aarch64' : 'x86_64'}-pc-windows-msvc`
  const rustEnvironment = () => windowsBuildEnvironment(windowsBuildEnvironment(env, state.environment), { RUSTUP_TOOLCHAIN: toolchain })
  const available = ['rustc', 'cargo'].every(command => {
    const result = run(state.tools.rust, ['run', toolchain, command, '--version'], { cwd: target, env: rustEnvironment(), encoding: 'utf8', timeout: 30_000 })
    return !result.error && result.status === 0
  })
  if (!available) {
    log(`Preparing Rust ${toolchain}...`)
    execute(state.tools.rust, ['toolchain', 'install', toolchain, '--profile', 'minimal', '--no-self-update'], 'Preparing Rust stable MSVC')
    for (const command of ['rustc', 'cargo']) execute(state.tools.rust, ['run', toolchain, command, '--version'], `Checking Rust ${command}`, 30_000)
  }
  log('Windows desktop build tools are ready.')
  return { powershell, env: rustEnvironment(), rustup: state.tools.rust, toolchain }
}
