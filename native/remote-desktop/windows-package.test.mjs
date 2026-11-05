import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { HELPER_FILES, helperVersion, markHelperReady } from './helper-version.mjs'
import { createWindowsPackageManifest, validateWindowsPackage, windowsPackageName, windowsPackageChecksum, windowsPackagePath, WINDOWS_PACKAGE_MANIFEST } from './windows-package.mjs'
import { installWindowsNative, lockWindowsInstall, publishWindowsPackage, verifyWindowsPackage } from './install-windows-native.mjs'

const identity = { sourceHash: 'a'.repeat(64), arch: 'x64' }
async function helperSources(destination) {
  for (const file of HELPER_FILES) {
    await fs.mkdir(path.dirname(path.join(destination, file)), { recursive: true })
    await fs.copyFile(new URL(file, import.meta.url), path.join(destination, file))
  }
}
async function fixture(work) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-desktop-package-'))
  try {
    const payload = path.join(root, 'payload')
    for (const [file, body] of Object.entries({
      'gpu-windows.dll': 'GPU fixture', 'mew-desktop-engine.dll': 'Rust fixture',
      'node_modules/koffi/package.json': '{}', 'node_modules/node-datachannel/package.json': '{}',
      'rust/vendor/component/LICENSE': 'fixture license', 'rust/vendor/component/.cargo-checksum.json': '{}',
      'notices/native.txt': 'fixture notices',
    })) { await fs.mkdir(path.dirname(path.join(payload, file)), { recursive: true }); await fs.writeFile(path.join(payload, file), body) }
    await createWindowsPackageManifest(payload, identity)
    await work({ root, payload, target: path.join(root, 'installed') })
  } finally { await fs.rm(root, { recursive: true, force: true }) }
}

test('desktop manifests bind native binaries, prebuilt modules, preserved sources and notices to exact source and CPU', () => fixture(async ({ payload }) => {
  const manifest = await validateWindowsPackage(payload, identity)
  assert.equal(manifest.platform, 'win32')
  assert.equal(manifest.format, 1)
  assert.ok(manifest.files.some(file => file.path.endsWith('.cargo-checksum.json')))
  await assert.rejects(validateWindowsPackage(payload, { ...identity, sourceHash: 'b'.repeat(64) }), /sourceHash/)
  await assert.rejects(validateWindowsPackage(payload, { ...identity, arch: 'arm64' }), /arch/)
  await fs.appendFile(path.join(payload, 'gpu-windows.dll'), 'corrupt')
  await assert.rejects(validateWindowsPackage(payload, identity), /checksum mismatch/)
}))

test('undeclared files, missing sources/notices, duplicate paths and symlinks are rejected', () => fixture(async ({ root, payload }) => {
  await fs.writeFile(path.join(payload, 'node_modules/unlisted.txt'), 'extra')
  await assert.rejects(validateWindowsPackage(payload, identity), /undeclared files/)
  await fs.rm(path.join(payload, 'node_modules/unlisted.txt'))
  const file = path.join(payload, WINDOWS_PACKAGE_MANIFEST), manifest = JSON.parse(await fs.readFile(file, 'utf8'))
  await fs.writeFile(file, JSON.stringify({ ...manifest, files: [...manifest.files, manifest.files[0]] }))
  await assert.rejects(validateWindowsPackage(payload, identity), /Duplicate/)
  await fs.writeFile(file, JSON.stringify(manifest))
  await fs.rm(path.join(payload, 'notices'), { recursive: true })
  await assert.rejects(createWindowsPackageManifest(payload, identity), /notices/)
  if (process.platform !== 'win32') {
    await fs.symlink(root, path.join(payload, 'node_modules/link'))
    await assert.rejects(createWindowsPackageManifest(payload, identity), /links are not supported/)
  }
}))

test('portable package paths and checksums reject traversal, aliases, streams and ambiguity', () => {
  for (const file of ['../escape', '/absolute', 'node_modules/../escape', 'node_modules/a:stream', 'node_modules/AUX.txt', 'node_modules/a.', 'node_modules/a\\b', 'other/file']) assert.throws(() => windowsPackagePath(file), /Invalid Windows/)
  assert.equal(windowsPackagePath('rust/vendor/a/.cargo-checksum.json'), 'rust/vendor/a/.cargo-checksum.json')
  assert.equal(windowsPackageChecksum(`${'A'.repeat(64)}  package.zip\n`, 'package.zip'), 'a'.repeat(64))
  assert.throws(() => windowsPackageChecksum(`${'a'.repeat(64)}  package.zip\n${'a'.repeat(64)}  package.zip`, 'package.zip'), /ambiguous/)
  assert.throws(() => windowsPackageChecksum('x'.repeat(65537), 'package.zip'), /too large/)
  assert.throws(() => windowsPackageName('ia32'), /x64 and arm64/)
})

test('Windows preparation uses bundled package offline and verifies all files and ABIs before publication', () => fixture(async ({ root, payload, target }) => {
  const source = path.join(root, 'source'), name = windowsPackageName('x64'), bytes = Buffer.from('archive fixture'), phases = []
  await helperSources(source)
  await fs.mkdir(path.join(source, 'prebuilt'), { recursive: true })
  await fs.writeFile(path.join(source, 'prebuilt', name), bytes)
  await fs.writeFile(path.join(source, 'prebuilt', `${name}.sha256`), `${createHash('sha256').update(bytes).digest('hex')}  ${name}\n`)
  await installWindowsNative({ target, source, platform: 'win32', arch: 'x64', version: () => identity.sourceHash, log() {},
    fetchImpl() { assert.fail('Bundled installation must work offline') },
    run() { assert.fail('No package manager or compiler may run') },
    async extract(archive, destination) { phases.push('extract'); assert.deepEqual(await fs.readFile(archive), bytes); await fs.cp(payload, destination, { recursive: true }) },
    async verify(staged) { phases.push('abi'); assert.ok(await fs.stat(path.join(staged, 'gpu-windows.dll'))) },
    async publish(...args) { phases.push('publish'); await publishWindowsPackage(...args) },
  })
  assert.deepEqual(phases, ['extract', 'abi', 'publish'])
  assert.equal(await fs.readFile(path.join(target, 'mew-desktop-engine.dll'), 'utf8'), 'Rust fixture')
  assert.equal(await fs.readFile(path.join(target, 'native-host.mjs'), 'utf8'), await fs.readFile(path.join(source, 'native-host.mjs'), 'utf8'))
  assert.equal((await fs.readdir(target)).some(file => file.startsWith('.desktop-package-')), false)
  assert.equal(existsSync(path.join(target, '.mew-ready')), false, 'only the outer completed setup writes readiness')
}))

test('download selects a fixed official content-hash release and never falls back to tool installation', () => fixture(async ({ payload, target }) => {
  const requests = [], bytes = Buffer.from('download fixture'), name = windowsPackageName('x64')
  const options = { target, platform: 'win32', arch: 'x64', version: () => identity.sourceHash, log() {},
    run() { assert.fail('No package manager or compiler may run') },
    async extract(_archive, destination) { await fs.cp(payload, destination, { recursive: true }) }, verify() {},
  }
  await installWindowsNative({ ...options, fetchImpl: async url => {
    requests.push(url)
    return new Response(url.endsWith('/SHA256SUMS') ? `${createHash('sha256').update(bytes).digest('hex')}  ${name}\n` : bytes)
  } })
  const base = `https://github.com/s-saens/mew/releases/download/mew-desktop-${identity.sourceHash}`
  assert.deepEqual(requests, [`${base}/SHA256SUMS`, `${base}/${name}`])
  await assert.rejects(installWindowsNative({ ...options, fetchImpl: async () => new Response('', { status: 404 }) }), /unavailable.*No development tools were installed/)
  await assert.rejects(installWindowsNative({ ...options, fetchImpl: async () => new Response('x'.repeat(65537)) }), /checksum list is too large/)
  await assert.rejects(installWindowsNative({ ...options, fetchImpl: async url => new Response(url.endsWith('/SHA256SUMS') ? `${'0'.repeat(64)}  ${name}` : bytes) }), /archive checksum mismatch/)
  assert.equal(await fs.readFile(path.join(target, 'gpu-windows.dll'), 'utf8'), 'GPU fixture')
}))

test('wrong source, CPU or ABI cannot replace an installed helper', () => fixture(async ({ root, payload, target }) => {
  const source = path.join(root, 'source'), name = windowsPackageName('x64')
  await helperSources(source)
  await fs.mkdir(path.join(source, 'prebuilt'), { recursive: true })
  await fs.writeFile(path.join(source, 'prebuilt', name), 'archive')
  await fs.writeFile(path.join(source, 'prebuilt', `${name}.sha256`), `${createHash('sha256').update('archive').digest('hex')}  ${name}`)
  await fs.mkdir(target); await fs.writeFile(path.join(target, 'gpu-windows.dll'), 'old GPU')
  const options = { source, target, platform: 'win32', arch: 'x64', version: () => identity.sourceHash, log() {}, async extract(_archive, destination) { await fs.cp(payload, destination, { recursive: true }) }, publish() { assert.fail('Invalid native modules cannot be published') } }
  await assert.rejects(installWindowsNative({ ...options, verify() { throw new Error('GPU ABI mismatch') } }), /ABI mismatch/)
  const manifestFile = path.join(payload, WINDOWS_PACKAGE_MANIFEST), manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'))
  for (const changed of [{ sourceHash: 'b'.repeat(64) }, { arch: 'arm64' }]) {
    await fs.writeFile(manifestFile, JSON.stringify({ ...manifest, ...changed }))
    await assert.rejects(installWindowsNative({ ...options, verify() { assert.fail('Manifest must be checked before loading binaries') } }), /does not match this installation/)
  }
  await fs.writeFile(manifestFile, JSON.stringify(manifest))
  await assert.rejects(installWindowsNative({ ...options, version: file => file === source ? identity.sourceHash : 'b'.repeat(64), verify() { assert.fail('Changed sources must not load native code') } }), /sources changed during package preparation/)
  assert.equal(await fs.readFile(path.join(target, 'gpu-windows.dll'), 'utf8'), 'old GPU')
}))

test('a native file replacement failure rolls back prior modules and binaries', () => fixture(async ({ root, payload, target }) => {
  await fs.mkdir(path.join(target, 'node_modules'), { recursive: true })
  await fs.writeFile(path.join(target, 'node_modules/previous.txt'), 'old modules')
  await fs.writeFile(path.join(target, 'gpu-windows.dll'), 'old GPU')
  await fs.writeFile(path.join(target, '.mew-ready'), 'previous readiness')
  await assert.rejects(publishWindowsPackage(payload, target, path.join(root, 'backup'), async (from, to) => {
    if (from === path.join(payload, 'mew-desktop-engine.dll')) throw new Error('DLL locked')
    await fs.rename(from, to)
  }), /DLL locked/)
  assert.equal(await fs.readFile(path.join(target, 'node_modules/previous.txt'), 'utf8'), 'old modules')
  assert.equal(await fs.readFile(path.join(target, 'gpu-windows.dll'), 'utf8'), 'old GPU')
  assert.equal(await fs.readFile(path.join(target, '.mew-ready'), 'utf8'), 'previous readiness')
  assert.equal(existsSync(path.join(target, WINDOWS_PACKAGE_MANIFEST)), false)
}))

test('source files and the previous readiness marker roll back together with native components', () => fixture(async ({ root, payload, target }) => {
  const source = path.join(root, 'source'), name = windowsPackageName('x64')
  await helperSources(source)
  await fs.mkdir(path.join(source, 'prebuilt'))
  await fs.writeFile(path.join(source, 'prebuilt', name), 'archive')
  await fs.writeFile(path.join(source, 'prebuilt', `${name}.sha256`), `${createHash('sha256').update('archive').digest('hex')}  ${name}`)
  await fs.mkdir(target)
  for (const [file, contents] of Object.entries({ 'native-host.mjs': 'previous source', '.mew-ready': 'previous readiness', 'gpu-windows.dll': 'previous GPU' })) await fs.writeFile(path.join(target, file), contents)
  await assert.rejects(installWindowsNative({ target, source, arch: 'x64', platform: 'win32', version: () => identity.sourceHash, log() {},
    async extract(_archive, destination) { await fs.cp(payload, destination, { recursive: true }) }, verify() {},
    publish(staged, destination, backup, _rename, units) { return publishWindowsPackage(staged, destination, backup, async (from, to) => {
      if (from === path.join(staged, 'mew-desktop-engine.dll')) throw new Error('DLL locked')
      await fs.rename(from, to)
    }, units) },
  }), /DLL locked/)
  assert.equal(await fs.readFile(path.join(target, 'native-host.mjs'), 'utf8'), 'previous source')
  assert.equal(await fs.readFile(path.join(target, '.mew-ready'), 'utf8'), 'previous readiness')
  assert.equal(await fs.readFile(path.join(target, 'gpu-windows.dll'), 'utf8'), 'previous GPU')
}))

test('an interrupted rollback preserves its recovery backup', () => fixture(async ({ root, payload, target }) => {
  await fs.mkdir(target)
  await fs.writeFile(path.join(target, 'gpu-windows.dll'), 'old GPU')
  const backup = path.join(root, 'backup')
  await assert.rejects(publishWindowsPackage(payload, target, backup, async (from, to) => {
    if (from === path.join(payload, 'mew-desktop-engine.dll') || from === path.join(backup, 'gpu-windows.dll')) throw new Error('DLL locked')
    await fs.rename(from, to)
  }), error => error instanceof AggregateError && error.preserveBackup && error.message.includes(backup))
  assert.equal(await fs.readFile(path.join(backup, 'gpu-windows.dll'), 'utf8'), 'old GPU')
}))

test('desktop installation locks exclude simultaneous setup and recover only dead owners', () => fixture(async ({ target }) => {
  await fs.mkdir(target)
  const release = await lockWindowsInstall(target)
  await assert.rejects(lockWindowsInstall(target), /Another desktop setup is running/)
  await release()
  await fs.writeFile(path.join(target, '.mew-install.lock'), JSON.stringify({ pid: 99999999, token: 'dead' }))
  const recovered = await lockWindowsInstall(target, () => false)
  await recovered()
  assert.equal(existsSync(path.join(target, '.mew-install.lock')), false)
}))

test('Windows readiness refuses sources that differ from the installed package', () => fixture(async ({ target }) => {
  await helperSources(target)
  const manifest = { format: 1, platform: 'win32', arch: 'x64', sourceHash: helperVersion(target) }
  const file = path.join(target, WINDOWS_PACKAGE_MANIFEST)
  await fs.writeFile(file, JSON.stringify({ ...manifest, sourceHash: 'b'.repeat(64) }))
  assert.throws(() => markHelperReady(target, { platform: 'win32', arch: 'x64' }), /sources no longer match/)
  assert.equal(existsSync(path.join(target, '.mew-ready')), false)
  await fs.writeFile(file, JSON.stringify(manifest))
  markHelperReady(target, { platform: 'win32', arch: 'x64' })
  assert.equal((await fs.readFile(path.join(target, '.mew-ready'), 'utf8')).trim(), manifest.sourceHash)
}))

test('ABI verification loads libraries without starting capture, input, GUI, or development commands', () => {
  const calls = []
  verifyWindowsPackage('/fixture', (command, args, options) => { calls.push({ command, args, options }); return { status: 0 } })
  assert.equal(calls[0].command, process.execPath)
  assert.match(calls[0].args.at(-1), /mew_gpu_abi.*!==5/)
  assert.match(calls[0].args.at(-1), /mew_engine_abi.*!==1/)
  assert.doesNotMatch(calls[0].args.at(-1), /mew_engine_create|mew_gpu_create|cargo|winget/)
})

test('Windows setup installs only prebuilt components and hashes the installer contract', () => {
  const script = readFileSync(new URL('./install.ps1', import.meta.url), 'utf8')
  assert.doesNotMatch(script, /npm|cargo|winget|install-windows-gpu|install-rust-engine/)
  assert.ok(script.indexOf('install-windows-native.mjs') < script.indexOf("'helper-version.mjs') mark"))
  for (const file of ['windows-package.mjs', 'extract-windows-package.ps1', 'install-windows-native.mjs']) assert.ok(HELPER_FILES.includes(file))
  assert.ok(!HELPER_FILES.includes('windows-build-tools.mjs'))
})

test('all helper identity inputs use LF bytes in Windows and POSIX Git checkouts', () => {
  const repository = fileURLToPath(new URL('../../', import.meta.url))
  const attributes = execFileSync('git', ['check-attr', 'eol', '--', ...HELPER_FILES.map(file => `native/remote-desktop/${file}`)], { cwd: repository, encoding: 'utf8' }).trim().split('\n')
  assert.equal(attributes.length, HELPER_FILES.length)
  for (const line of attributes) assert.ok(line.endsWith(': eol: lf'), line)
})

// Small stored-ZIP fixture writer; no archive tool or installed development
// dependency is needed to exercise the real Windows extraction boundary.
function zip(entries) {
  const local = [], central = []
  let offset = 0
  for (const { name, data = 'fixture', attributes = 0, declaredSize } of entries) {
    const filename = Buffer.from(name), bytes = Buffer.from(data)
    let crc = 0xffffffff
    for (const value of bytes) { crc ^= value; for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0) }
    crc = (crc ^ 0xffffffff) >>> 0
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt32LE(crc, 14); header.writeUInt32LE(bytes.length, 18); header.writeUInt32LE(declaredSize ?? bytes.length, 22); header.writeUInt16LE(filename.length, 26)
    local.push(header, filename, bytes)
    const index = Buffer.alloc(46); index.writeUInt32LE(0x02014b50); index.writeUInt16LE(20, 4); index.writeUInt16LE(20, 6); index.writeUInt16LE(0x800, 8); index.writeUInt32LE(crc, 16); index.writeUInt32LE(bytes.length, 20); index.writeUInt32LE(declaredSize ?? bytes.length, 24); index.writeUInt16LE(filename.length, 28); index.writeUInt32LE(attributes >>> 0, 38); index.writeUInt32LE(offset, 42)
    central.push(index, filename); offset += header.length + filename.length + bytes.length
  }
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(Buffer.concat(central).length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, ...central, end])
}

const windowsPowerShell = process.platform === 'win32'
  ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe') : '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
test('real Windows PowerShell extracts hidden sources and rejects traversal, links and duplicate aliases before writing', {
  skip: !existsSync(windowsPowerShell), timeout: 60_000,
}, () => fixture(async ({ root }) => {
  const windowsPath = file => process.platform === 'win32' ? file : execFileSync('wslpath', ['-w', file], { encoding: 'utf8' }).trim()
  const script = windowsPath(fileURLToPath(new URL('./extract-windows-package.ps1', import.meta.url)))
  for (const file of ['install.ps1', 'windows-build-environment.ps1']) {
    const source = windowsPath(fileURLToPath(new URL(file, import.meta.url))).replaceAll("'", "''")
    const parse = `$tokens=$null;$errors=$null;[void][Management.Automation.Language.Parser]::ParseFile('${source}',[ref]$tokens,[ref]$errors);if($errors.Count){throw ($errors | Out-String)}`
    const result = spawnSync(windowsPowerShell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(parse, 'utf16le').toString('base64')], { encoding: 'utf8', timeout: 10_000 })
    assert.equal(result.status, 0, result.stderr)
  }
  const cases = [
    { entries: [{ name: 'rust/vendor/a/.cargo-checksum.json', data: '{}' }], success: true },
    { entries: [{ name: `rust/vendor/${'very-long-vendor-directory/'.repeat(12)}LICENSE` }], success: true },
    ...['../escape', 'C:/escape', 'node_modules/test:stream', 'node_modules/AUX.txt', 'node_modules/COM¹.txt', 'node_modules/a.'].map(name => ({ entries: [{ name: 'good.txt' }, { name }], success: false })),
    { entries: [{ name: 'linked', attributes: 0xa1ff << 16 }], success: false },
    { entries: [{ name: 'node_modules/file' }, { name: 'node_modules/FILE' }], success: false },
  ]
  for (let index = 0; index < cases.length; index++) {
    const scenario = cases[index], archive = path.join(root, `archive-${index}.zip`), destination = path.join(root, `unpacked-${index}`)
    await fs.writeFile(archive, zip(scenario.entries))
    const result = spawnSync(windowsPowerShell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Archive', windowsPath(archive), '-Destination', windowsPath(destination)], { encoding: 'utf8', timeout: 10_000 })
    if (scenario.success) { assert.equal(result.status, 0, result.stderr); assert.equal(await fs.readFile(path.join(destination, scenario.entries[0].name), 'utf8'), scenario.entries[0].data ?? 'fixture') }
    else { assert.notEqual(result.status, 0, JSON.stringify(scenario.entries)); assert.equal((await fs.readdir(destination)).length, 0, 'no files may be written before all entries are validated') }
  }
  const archive = path.join(root, 'incorrect-size.zip'), destination = path.join(root, 'incorrect-size')
  await fs.writeFile(archive, zip([{ name: 'too-large.txt', data: 'longer than declared', declaredSize: 1 }]))
  const result = spawnSync(windowsPowerShell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Archive', windowsPath(archive), '-Destination', windowsPath(destination)], { encoding: 'utf8', timeout: 10_000 })
  assert.notEqual(result.status, 0)
  assert.ok((await fs.stat(path.join(destination, 'too-large.txt'))).size <= 1)
  assert.equal(existsSync(path.join(root, 'escape')), false)
}))
