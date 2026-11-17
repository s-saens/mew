import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { checksumFor } from './runtime.mjs'
import { stagePersistentCli } from './startup.mjs'

const releaseBase = 'https://github.com/s-saens/mew/releases/download'
const requiredAssets = ['installer-core.ps1', 'launcher-core.ps1', 'launch.ps1', 'bootstrap-linux.sh', 'launch-linux.sh', 'verify-linux.sh', 'downloads.json', 'npm-setup.ps1']

export function windowsInstallManifest(version, sums, downloads) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Managed Windows installation requires a stable Mew version.')
  for (const item of [downloads.rootfs, downloads.node]) {
    if (!/^https:\/\//.test(item?.url) || !/^[a-f0-9]{64}$/.test(item?.sha256)) throw new Error('Windows prerequisite downloads require pinned HTTPS checksums.')
  }
  return { format: 1, arch: 'x64', rootfs: downloads.rootfs, node: downloads.node,
    runtime: { version, url: `${releaseBase}/mew-cli-v${version}/mew-runtime-linux-x64.tar.gz`, sha256: checksumFor(sums, 'mew-runtime-linux-x64.tar.gz') } }
}

async function executePowerShell(command, args, { detached = false } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: detached ? 'ignore' : 'inherit', windowsHide: true, detached })
    child.once('error', reject)
    if (detached) { child.once('spawn', () => { child.unref(); resolve(0) }) }
    else child.once('exit', (code, signal) => signal ? reject(new Error(`Mew Windows setup stopped (${signal}).`)) : resolve(code ?? 1))
  })
}

/** Called only by Windows Node; all application execution stays in Mew's owned WSL. */
export async function bootstrapWindows({ version, packageRoot, options }, {
  env = process.env, arch = process.arch, platform = process.platform, fetchImpl = fetch,
  run = executePowerShell, stage = stagePersistentCli, log = console.log,
} = {}) {
  if (platform !== 'win32') throw new Error('Managed Windows setup is only available from Windows Node.js.')
  if (arch !== 'x64') throw new Error('The managed WSL installer currently supports Windows x64; Windows ARM64 acceptance is not complete.')
  if (!env.LOCALAPPDATA || !env.SystemRoot) throw new Error('Windows local application paths are unavailable.')
  const action = ['stop', 'status', 'disable-autostart'].includes(options.action) ? options.action : 'start'
  let activeVersion = version
  if (action !== 'start') {
    try {
      const state = JSON.parse(await fs.readFile(path.join(env.LOCALAPPDATA, 'mew', 'windows-install', 'installation.json'), 'utf8'))
      if (/^\d+\.\d+\.\d+$/.test(state.version)) activeVersion = state.version
    } catch { /* Fall back to this package's installation. */ }
  }
  const base = path.join(env.LOCALAPPDATA, 'Programs', 'Mew', activeVersion)
  const shell = path.join(env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const command = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(base, 'npm-setup.ps1'), '-AppRoot', base, ...(options.autostart === false ? ['-NoAutostart'] : [])]
  if (action !== 'start') {
    try { await fs.access(path.join(base, 'npm-setup.ps1')) } catch { log('Mew is not installed.'); return { appRoot: base, exitCode: 0, rebootRequired: false } }
    const exitCode = await run(shell, [...command, '-Action', action])
    return { appRoot: base, exitCode, rebootRequired: false }
  }
  const source = path.join(packageRoot, 'windows-assets')
  for (const name of requiredAssets) await fs.access(path.join(source, name))
  const response = await fetchImpl(`${releaseBase}/mew-cli-v${version}/SHA256SUMS`, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`Mew ${version} runtime release is unavailable (HTTP ${response.status}).`)
  const sums = await response.text()
  if (sums.length > 64 * 1024) throw new Error('The runtime checksum list is too large.')
  const manifest = windowsInstallManifest(version, sums, JSON.parse(await fs.readFile(path.join(source, 'downloads.json'), 'utf8')))
  await fs.mkdir(base, { recursive: true })
  for (const name of requiredAssets) await fs.copyFile(path.join(source, name), path.join(base, name))
  const persistent = await stage({ packageRoot, version, dataDir: path.join(env.LOCALAPPDATA, 'mew', 'windows-launcher') })
  await fs.cp(persistent.directory, path.join(base, 'cli'), { recursive: true, dereference: true })
  await fs.writeFile(path.join(base, 'install-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  const exitCode = await run(shell, [...command, '-Action', 'prepare'])
  if (exitCode === 3010) {
    log('Windows needs a restart. Mew setup will continue after you sign in again; existing WSL distributions are preserved.')
    return { appRoot: base, exitCode: 0, rebootRequired: true }
  }
  if (exitCode !== 0) throw new Error(`Mew Windows preparation failed (${exitCode}). Rerun npx mew-ide to resume.`)
  // The persistent controller survives the calling CMD/PowerShell session.
  await run(shell, [...command, '-Action', 'launch'], { detached: true })
  return { appRoot: base, exitCode: 0, rebootRequired: false }
}
