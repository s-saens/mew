import { spawnSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { HELPER_FILES, helperVersion } from './helper-version.mjs'
import { WINDOWS_PACKAGE_LIMIT, WINDOWS_PACKAGE_UNITS, windowsFileHash, windowsPackageChecksum, windowsPackageName, validateWindowsPackage } from './windows-package.mjs'

const directory = path.dirname(fileURLToPath(import.meta.url))
const officialRelease = 'https://github.com/s-saens/mew/releases/download'
const powershell = path.win32.join(process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')

function execute(run, command, args, options) {
  const result = run(command, args, options)
  if (result.error || result.status !== 0) throw new Error(`Desktop package verification failed: ${result.error?.message || result.stderr || result.signal || result.status}`)
}

export function extractWindowsPackage(archive, destination, run = spawnSync) {
  execute(run, powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(directory, 'extract-windows-package.ps1'), '-Archive', archive, '-Destination', destination], { stdio: 'inherit', timeout: 5 * 60_000 })
}

export function verifyWindowsPackage(directory, run = spawnSync) {
  const probe = `import path from 'node:path'; import rtc from 'node-datachannel'; import koffi from 'koffi';
if(!rtc.getLibraryVersion() || !koffi.version) throw new Error('Desktop native dependencies are missing');
if(koffi.load(path.resolve('gpu-windows.dll')).func('int mew_gpu_abi()')()!==5) throw new Error('GPU ABI mismatch');
if(koffi.load(path.resolve('mew-desktop-engine.dll')).func('int mew_engine_abi()')()!==1) throw new Error('Rust ABI mismatch');
rtc.cleanup();`
  execute(run, process.execPath, ['--input-type=module', '-e', probe], { cwd: directory, stdio: 'inherit', timeout: 30_000 })
}

async function exists(file) {
  try { await fs.lstat(file); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error }
}

export async function lockWindowsInstall(target, alive = pid => {
  try { process.kill(pid, 0); return true } catch (error) { return error.code !== 'ESRCH' }
}) {
  const file = path.join(target, '.mew-install.lock'), guard = `${file}.recovery`, token = randomUUID()
  for (let attempt = 0; attempt < 3; attempt++) {
    let handle
    try { handle = await fs.open(file, 'wx', 0o600) }
    catch (error) { if (error.code !== 'EEXIST') throw error }
    if (handle) {
      try { await handle.writeFile(JSON.stringify({ pid: process.pid, token })) } finally { await handle.close() }
      return async () => {
        try { if (JSON.parse(await fs.readFile(file, 'utf8')).token === token) await fs.unlink(file) }
        catch (error) { if (error.code !== 'ENOENT') throw error }
      }
    }
    let recovery
    try { recovery = await fs.open(guard, 'wx', 0o600) }
    catch (error) { if (error.code !== 'EEXIST') throw error; throw new Error(`Another desktop setup is checking its lock. Retry after it finishes; interrupted recovery may require removing ${guard}.`) }
    try {
      let previous
      try { previous = JSON.parse(await fs.readFile(file, 'utf8')) }
      catch (error) { if (error.code === 'ENOENT') continue; throw new Error(`Cannot read the desktop setup lock. Check for another installer before removing ${file}.`) }
      if (!Number.isSafeInteger(previous.pid) || previous.pid < 1 || alive(previous.pid)) throw new Error('Another desktop setup is running for this installation. Wait for it to finish, then retry.')
      await fs.unlink(file)
    } finally { await recovery.close(); await fs.unlink(guard) }
  }
  throw new Error('Could not acquire the desktop setup lock.')
}

async function downloadPackage(base, name, archive, fetchImpl) {
  const sums = await fetchImpl(`${base}/SHA256SUMS`, { signal: AbortSignal.timeout(30_000) })
  if (!sums.ok) throw new Error(`A prebuilt Windows desktop package for this source is unavailable (HTTP ${sums.status}). No development tools were installed. A matching desktop release must be published before retrying.`)
  let checksumBytes = 0
  const chunks = []
  if (!sums.body) throw new Error('Desktop checksum list is empty.')
  for await (const chunk of Readable.fromWeb(sums.body)) {
    checksumBytes += chunk.length
    if (checksumBytes > 64 * 1024) throw new Error('Desktop checksum list is too large.')
    chunks.push(chunk)
  }
  const expected = windowsPackageChecksum(Buffer.concat(chunks).toString('utf8'), name)
  const response = await fetchImpl(`${base}/${name}`, { signal: AbortSignal.timeout(10 * 60_000) })
  if (!response.ok || !response.body) throw new Error(`Could not download the Windows desktop package (HTTP ${response.status}). Retry preparation after checking the connection.`)
  const hash = createHash('sha256')
  let size = 0
  await pipeline(Readable.fromWeb(response.body), new Transform({ transform(bytes, _encoding, callback) {
    size += bytes.length
    if (size > WINDOWS_PACKAGE_LIMIT) return callback(new Error('Windows desktop package download exceeds its size limit.'))
    hash.update(bytes)
    callback(null, bytes)
  } }), createWriteStream(archive, { mode: 0o600, flags: 'wx' }))
  if (hash.digest('hex') !== expected) throw new Error('Windows desktop archive checksum mismatch.')
}

/** Only validated fixed package units replace the installation. Restore all
 * previous units if a rename fails, including files locked by a resident host. */
export async function publishWindowsPackage(staged, target, backup, rename = fs.rename, units = WINDOWS_PACKAGE_UNITS) {
  const changes = []
  try {
    for (const unit of ['.mew-ready', ...units]) {
      const destination = path.join(target, unit), previous = path.join(backup, unit)
      const change = { destination, previous, saved: false, installed: false }
      changes.push(change)
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.mkdir(path.dirname(previous), { recursive: true })
      if (await exists(destination)) { await rename(destination, previous); change.saved = true }
      if (unit === '.mew-ready') continue
      await rename(path.join(staged, unit), destination)
      change.installed = true
    }
  } catch (error) {
    const failures = [error]
    for (const change of changes.reverse()) {
      try {
        if (change.installed) await fs.rm(change.destination, { recursive: true, force: true })
        if (change.saved) await rename(change.previous, change.destination)
      } catch (failure) { failures.push(failure) }
    }
    if (failures.length > 1) {
      const failure = new AggregateError(failures, `Desktop package rollback needs recovery. Previous files remain in ${backup}.`)
      failure.preserveBackup = true
      throw failure
    }
    throw error
  }
}

/** End-user preparation never invokes npm, compilers, or package managers. */
export async function installWindowsNative({ target, source = directory, arch = process.arch, platform = process.platform,
  run = spawnSync, fetchImpl = fetch, log = console.log, version = helperVersion,
  extract = extractWindowsPackage, verify = verifyWindowsPackage, publish = publishWindowsPackage } = {}) {
  if (platform !== 'win32') throw new Error('Windows desktop package installation requires Windows Node.')
  const sourceHash = version(source), name = windowsPackageName(arch)
  if (!/^[a-f0-9]{64}$/.test(sourceHash)) throw new Error('Invalid desktop source hash.')
  await fs.mkdir(target, { recursive: true })
  const unlock = await lockWindowsInstall(target)
  let temporary
  let preserveBackup = false
  try {
    temporary = await fs.mkdtemp(path.join(target, '.desktop-package-'))
    const archive = path.join(temporary, name), staged = path.join(temporary, 'staged')
    const bundled = path.join(source, 'prebuilt', name)
    if (await exists(bundled)) {
      log('Using the bundled Windows desktop package...')
      const stat = await fs.lstat(bundled)
      if (!stat.isFile() || stat.size > WINDOWS_PACKAGE_LIMIT) throw new Error('Invalid bundled desktop archive.')
      const expected = windowsPackageChecksum(await fs.readFile(`${bundled}.sha256`, 'utf8'), name)
      await fs.copyFile(bundled, archive)
      if (await windowsFileHash(archive) !== expected) throw new Error('Bundled Windows desktop archive checksum mismatch.')
    } else {
      log('Downloading the prebuilt Windows desktop package; no development tools are required...')
      await downloadPackage(`${officialRelease}/mew-desktop-${sourceHash}`, name, archive, fetchImpl)
    }
    await extract(archive, staged, run)
    await validateWindowsPackage(staged, { sourceHash, arch })
    for (const file of HELPER_FILES) {
      await fs.mkdir(path.dirname(path.join(staged, file)), { recursive: true })
      await fs.copyFile(path.join(source, file), path.join(staged, file))
    }
    if (version(staged) !== sourceHash) throw new Error('Helper sources changed during package preparation. Retry with one consistent source revision.')
    await verify(staged, run)
    await publish(staged, target, path.join(temporary, 'previous'), undefined, [...HELPER_FILES, ...WINDOWS_PACKAGE_UNITS])
    log('Windows desktop native components installed and verified.')
  } catch (error) { preserveBackup = Boolean(error.preserveBackup); throw error }
  finally {
    try { if (temporary && !preserveBackup) await fs.rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) }
    finally { await unlock() }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  try {
    if (args.length && (args.length !== 2 || args[0] !== '--target' || !path.isAbsolute(args[1]))) throw new Error('Usage: install-windows-native.mjs [--target <absolute installation directory>]')
    await installWindowsNative({ target: args[1] || directory, source: directory })
  }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
