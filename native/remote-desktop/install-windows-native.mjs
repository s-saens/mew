import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareWindowsBuildTools } from './windows-build-tools.mjs'
import { installRustEngine } from './install-rust-engine.mjs'

export function installWindowsNative({ target, run = spawnSync, prepare = prepareWindowsBuildTools, installEngine = installRustEngine } = {}) {
  const { powershell, env, rustup, toolchain } = prepare({ target, run })
  const result = run(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(target, 'install-windows-gpu.ps1'), '-Target', target], { cwd: target, env, stdio: 'inherit', timeout: 20 * 60_000 })
  if (result.error || result.status !== 0) throw new Error(`Windows GPU module preparation failed: ${result.error?.message || result.signal || result.status}`)
  installEngine({ target, platform: 'win32', run: (command, args, options) => command === 'cargo'
    ? run(rustup, ['run', toolchain, 'cargo', ...args], { ...options, env })
    : run(command, args, { ...options, env }) })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { installWindowsNative({ target: path.dirname(fileURLToPath(import.meta.url)) }) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
