import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { HELPER_FILES, helperVersion } from './helper-version.mjs'
import { installRustEngine } from './install-rust-engine.mjs'
import { createWindowsPackageManifest, windowsFileHash, windowsPackageName } from './windows-package.mjs'

const directory = path.dirname(fileURLToPath(import.meta.url))
const systemLibraries = new Set(('advapi32 bcrypt bcryptprimitives combase comctl32 comdlg32 crypt32 cryptbase cryptsp d3d11 d3d12 d3dcompiler_47 dcomp dinput8 dnsapi dwmapi dxgi gdi32 gdi32full hid imm32 iphlpapi kernel32 kernelbase mf mfcore mfplat mfreadwrite mmdevapi msacm32 msasn1 msimg32 msvcrt mswsock ncrypt netapi32 normaliz ntdll ole32 oleacc oleaut32 powrprof propsys psapi rpcrt4 rsaenh rtworkq secur32 setupapi shcore shell32 shlwapi sspicli ucrtbase uiautomationcore user32 userenv uxtheme version webservices win32u windowscodecs winhttp wininet winmm winnsi winsta wintrust winusb wldap32 ws2_32 wsock32 wtsapi32').split(' ').map(name => `${name}.dll`))

export function verifyWindowsPackageDependencies(output, adjacentLibraries = []) {
  const libraries = output.split(/\r?\n/).map(line => /^\s+([a-zA-Z0-9_.+-]+\.dll)\s*$/i.exec(line)?.[1]).filter(Boolean)
  if (!libraries.length) throw new Error('Could not inspect Windows desktop DLL dependencies.')
  const adjacent = new Set(adjacentLibraries.map(name => name.toLowerCase()))
  const external = libraries.filter(name => !systemLibraries.has(name.toLowerCase()) && !/^(?:api|ext)-ms-win-/i.test(name) && !adjacent.has(name.toLowerCase()))
  if (external.length) throw new Error(`Desktop DLLs require unbundled build/runtime libraries: ${external.join(', ')}.`)
}

export const WINDOWS_NATIVE_SOURCE_COMPONENTS = [
  { name: 'node-datachannel-0.33.4', repository: 'https://github.com/murat-dogan/node-datachannel.git', commit: '5f4365700d4dcc51ab2a3d90eb2d05592bf84c7a' },
  { name: 'libdatachannel-0.24.5', repository: 'https://github.com/paullouisageneau/libdatachannel.git', commit: '443f6934d9007eb7076ab7825ba330f355fcbead', submodules: true },
  { name: 'openssl-3.6.4', repository: 'https://github.com/openssl/openssl.git', commit: 'd3c1b1169b3569ff3069e5b399f47b2b28e03d79' },
  { name: 'vcpkg-openssl-port', repository: 'https://github.com/microsoft/vcpkg.git', commit: '04a9d8e5212d01ee1dd9478eadd9caade4f8b0d4', sparse: ['ports/openssl'] },
]

/** Preserve the npm binding's own sources; the Rust engine vendors a different version. */
export async function preserveWindowsNativeSources({ source, destination, components = WINDOWS_NATIVE_SOURCE_COMPONENTS, run = spawnSync, env = process.env }) {
  const manifest = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8'))
  if (manifest.dependencies?.['node-datachannel'] !== '0.33.4') throw new Error('Update Windows npm native source provenance for the selected node-datachannel version.')
  const origins = []
  await fs.mkdir(destination, { recursive: true })
  const git = (directory, args) => {
    const result = run('git', args, { cwd: directory, env, stdio: 'pipe', encoding: 'utf8', timeout: 10 * 60_000 })
    if (result.error || result.status !== 0) throw new Error(`Windows native source collection failed: ${result.error?.message || result.stderr || result.signal || result.status}`)
    return result.stdout.trim()
  }
  for (const component of components) {
    const directory = path.join(destination, component.name)
    await fs.mkdir(directory)
    git(directory, ['init', '--quiet'])
    git(directory, ['config', 'core.autocrlf', 'false'])
    git(directory, ['config', 'core.longpaths', 'true'])
    git(directory, ['remote', 'add', 'origin', component.repository])
    git(directory, ['fetch', '--quiet', '--depth=1', '--filter=blob:none', 'origin', component.commit])
    if (component.sparse) git(directory, ['sparse-checkout', 'set', ...component.sparse])
    git(directory, ['checkout', '--quiet', '--detach', 'FETCH_HEAD'])
    if (git(directory, ['rev-parse', 'HEAD']) !== component.commit) throw new Error(`Windows native source identity mismatch: ${component.name}`)
    let submodules = ''
    if (component.submodules) {
      git(directory, ['-c', 'core.autocrlf=false', '-c', 'core.longpaths=true', 'submodule', 'update', '--init', '--recursive', '--depth=1'])
      submodules = git(directory, ['submodule', 'status', '--recursive'])
      if (/^[+\-U]/m.test(submodules)) throw new Error(`Windows native dependency source mismatch: ${component.name}`)
    }
    origins.push({ ...component, submoduleCommits: submodules })
  }
  async function stripGit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.name === '.git') await fs.rm(file, { recursive: true, force: true })
      else if (entry.isDirectory()) await stripGit(file)
    }
  }
  await stripGit(destination)
  await fs.writeFile(path.join(destination, 'SOURCE-ORIGINS.json'), JSON.stringify({
    nodeDatachannelVersion: '0.33.4', libdatachannelVersion: '0.24.5', opensslVersion: '3.6.4', components: origins,
    upstreamBuild: 'https://github.com/murat-dogan/node-datachannel/actions/runs/34694175345',
    scope: 'Includes recursive libdatachannel dependencies and the exact OpenSSL port/patches. Test-only submodules outside libdatachannel are not fetched.',
  }, null, 2) + '\n')
}

function mergeEnvironment(original, additions) {
  const replaced = new Set(Object.keys(additions).map(key => key.toUpperCase()))
  return { ...Object.fromEntries(Object.entries(original).filter(([key]) => !replaced.has(key.toUpperCase()))), ...additions }
}

async function nativeBindings(folder) {
  const result = []
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name)
    if (entry.isSymbolicLink()) throw new Error('Windows desktop dependencies must not contain symbolic links.')
    if (entry.isDirectory()) result.push(...await nativeBindings(file))
    else if (/\.(?:node|dll)$/i.test(entry.name)) result.push(file)
  }
  return result
}

export const windowsPackageZipScript = `param([string]$Source, [string]$Output)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Get-MewExtendedPath([string]$Value) {
  $full = [IO.Path]::GetFullPath($Value)
  if ($full.StartsWith('\\\\?\\')) { return $full }
  if ($full.StartsWith('\\\\')) { return '\\\\?\\UNC\\' + $full.Substring(2) }
  return '\\\\?\\' + $full
}
$root = (Get-MewExtendedPath $Source).TrimEnd('\\')
$stream = [IO.File]::Open((Get-MewExtendedPath $Output), [IO.FileMode]::CreateNew)
try {
  $zip = New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Create, $true)
  try {
    foreach ($file in [IO.Directory]::EnumerateFiles($root, '*', [IO.SearchOption]::AllDirectories)) {
      $name = $file.Substring($root.Length + 1).Replace('\\', '/')
      [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file, $name, [IO.Compression.CompressionLevel]::Optimal)
    }
  } finally { $zip.Dispose() }
} finally { $stream.Dispose() }
`

/** Release-maintainer operation. Never called by the end-user helper installer. */
export async function buildWindowsPackage({ source = directory, output, platform = process.platform, arch = process.arch,
  env = process.env, run = spawnSync, node = process.execPath,
  npmCli = path.join(path.dirname(node), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  installEngine = installRustEngine, createManifest = createWindowsPackageManifest,
  preserveSources = preserveWindowsNativeSources,
  inspect, version = helperVersion, files = HELPER_FILES, log = console.log, cleanup = fs.rm,
} = {}) {
  if (platform !== 'win32' || !['x64', 'arm64'].includes(arch)) throw new Error('Desktop package builds require native Windows x64 or arm64.')
  if (!output) throw new Error('A desktop package output directory is required.')
  const sourceHash = version(source)
  if (!/^[a-f0-9]{64}$/.test(sourceHash)) throw new Error('Invalid desktop source hash.')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-desktop-build-'))
  const target = path.join(temporary, 'build'), payload = path.join(temporary, 'package')
  const powershell = path.win32.join(env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const execute = (command, args, settings = {}) => {
    const result = run(command, args, { cwd: target, env, stdio: 'inherit', timeout: 20 * 60_000, ...settings })
    if (result.error || result.status !== 0) throw new Error(`Windows desktop package command failed (${command}: ${result.error?.message || result.signal || result.status}).`)
    return result
  }
  let buildError
  const cleanupStaging = async () => {
    try { await cleanup(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) }
    catch (error) {
      if (!buildError) throw error
      log(`Could not remove Windows build staging at ${temporary}: ${error.message}. The original build error is preserved.`)
    }
  }
  try {
    await fs.mkdir(target, { recursive: true })
    for (const file of files) {
      const destination = path.join(target, file)
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.copyFile(path.join(source, file), destination)
    }
    if (version(target) !== sourceHash) throw new Error('Desktop sources changed while staging the package.')
    // Tool discovery runs only on the build worker.
    await fs.copyFile(path.join(source, 'windows-build-environment.ps1'), path.join(target, 'windows-build-environment.ps1'))
    const state = inspect ? inspect({ target, env }) : JSON.parse(execute(powershell,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(target, 'windows-build-environment.ps1')],
      { encoding: 'utf8', stdio: 'pipe', timeout: 60_000 }).stdout.replace(/^\uFEFF/, '').trim())
    if (state.architecture !== arch) throw new Error('Desktop build tools do not match the native package architecture.')
    const missing = ['visualStudio', 'cmake', 'clang', 'perl', 'rust'].filter(tool => !state.tools?.[tool])
    if (missing.length) throw new Error(`Prepare these build tools on the release runner first: ${missing.join(', ')}.`)
    const toolchain = `stable-${arch === 'arm64' ? 'aarch64' : 'x86_64'}-pc-windows-msvc`
    const buildEnv = mergeEnvironment(mergeEnvironment(env, state.environment), {
      RUSTUP_TOOLCHAIN: toolchain,
      RUSTFLAGS: '-C target-feature=+crt-static',
      CMAKE_MSVC_RUNTIME_LIBRARY: 'MultiThreaded',
    })
    for (const command of ['rustc', 'cargo']) execute(state.tools.rust, ['run', toolchain, command, '--version'], { env: buildEnv, timeout: 30_000 })
    const npmSources = path.join(temporary, 'npm-native-sources')
    log('Preserving the npm native dependencies and their original source notices...')
    await preserveSources({ source: target, destination: npmSources, run, env: buildEnv })
    log(`Building Windows ${arch} desktop package for ${sourceHash}...`)
    // Use npm's JS entrypoint: Windows .cmd files are not executables for spawn.
    execute(node, [npmCli, 'ci', '--prefix', target, '--omit=dev', '--include=optional', '--ignore-scripts', '--no-audit', '--no-fund'], { env: buildEnv, timeout: 10 * 60_000 })
    execute(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(target, 'install-windows-gpu.ps1'), '-Target', target], { env: buildEnv })
    installEngine({ target, platform: 'win32', log, buildTimeout: 60 * 60_000, run(command, args, options) {
      return run(command === 'cargo' ? state.tools.rust : command,
        command === 'cargo' ? ['run', toolchain, 'cargo', ...args] : args, { ...options, env: buildEnv })
    } })
    const binaries = [path.join(target, 'gpu-windows.dll'), path.join(target, 'mew-desktop-engine.dll'), ...await nativeBindings(path.join(target, 'node_modules'))]
    for (const file of binaries) {
      const adjacent = binaries.filter(binary => path.dirname(binary) === path.dirname(file)).map(binary => path.basename(binary))
      verifyWindowsPackageDependencies(execute('dumpbin.exe', ['/dependents', file], { env: buildEnv, encoding: 'utf8', stdio: 'pipe', timeout: 30_000 }).stdout, adjacent)
    }
    const probe = `import rtc from 'node-datachannel'; import koffi from 'koffi';
if (!rtc.getLibraryVersion() || !koffi.version) throw new Error('Native npm bindings unavailable');
for (const [file, symbol, abi] of [['gpu-windows.dll','mew_gpu_abi',5],['mew-desktop-engine.dll','mew_engine_abi',1]]) {
  if (koffi.load('./'+file).func('int '+symbol+'()')() !== abi) throw new Error('Desktop ABI mismatch: '+file);
} rtc.cleanup();`
    execute(node, ['--input-type=module', '-e', probe], { env: buildEnv, timeout: 30_000 })
    await fs.mkdir(payload, { recursive: true })
    for (const file of ['gpu-windows.dll', 'mew-desktop-engine.dll']) await fs.copyFile(path.join(target, file), path.join(payload, file))
    for (const folder of ['node_modules', 'rust/vendor']) await fs.cp(path.join(target, folder), path.join(payload, folder), { recursive: true, dereference: false })
    const notices = path.join(payload, 'notices', 'mew-desktop-source')
    for (const file of files) {
      await fs.mkdir(path.dirname(path.join(notices, file)), { recursive: true })
      await fs.copyFile(path.join(target, file), path.join(notices, file))
    }
    await fs.writeFile(path.join(payload, 'notices', 'README.txt'), 'Mew desktop source is preserved in mew-desktop-source/. Locked Rust dependency sources, including modified datachannel-sys and original notices, are preserved in ../rust/vendor/. Native npm package licenses remain in ../node_modules/. node-datachannel-native-sources.zip separately preserves node-datachannel 0.33.4, libdatachannel 0.24.5 and its pinned submodules, OpenSSL 3.6.4, its exact vcpkg port/patches, original notices, and build provenance in SOURCE-ORIGINS.json. The Rust engine uses a different libdatachannel/OpenSSL source tree. Build toolchains and SDKs are not distributed.\n')
    if (version(source) !== sourceHash || version(target) !== sourceHash) throw new Error('Desktop sources changed during the package build.')
    const zipScript = path.join(temporary, 'archive.ps1')
    await fs.writeFile(zipScript, windowsPackageZipScript)
    execute(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', zipScript, '-Source', npmSources, '-Output', path.join(payload, 'notices', 'node-datachannel-native-sources.zip')], { env: buildEnv, timeout: 10 * 60_000 })
    await createManifest(payload, { sourceHash, arch })
    const name = windowsPackageName(arch)
    const archive = path.join(temporary, name)
    execute(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', zipScript, '-Source', payload, '-Output', archive], { env: buildEnv, timeout: 10 * 60_000 })
    if (version(source) !== sourceHash || version(target) !== sourceHash) throw new Error('Desktop sources changed during the package build.')
    const checksum = await windowsFileHash(archive)
    await fs.mkdir(output, { recursive: true })
    const destination = path.join(output, name)
    await fs.copyFile(archive, destination, fs.constants.COPYFILE_EXCL)
    try { await fs.writeFile(`${destination}.sha256`, `${checksum}  ${name}\n`, { flag: 'wx' }) }
    catch (error) { await fs.rm(destination, { force: true }); throw error }
    return { archive: destination, sourceHash, arch, sha256: checksum }
  } catch (error) { buildError = error; throw error }
  finally { await cleanupStaging() }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.length !== 2 || args[0] !== '--output') throw new Error('Usage: node build-windows-package.mjs --output <directory>')
  console.log(JSON.stringify(await buildWindowsPackage({ output: path.resolve(args[1]) })))
}
