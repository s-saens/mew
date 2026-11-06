import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFile, execFileSync, spawnSync } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { buildWindowsPackage, verifyWindowsPackageDependencies, windowsPackageZipScript } from './build-windows-package.mjs'

const execute = promisify(execFile)

async function fixture(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-desktop-package-test-'))
  const source = path.join(root, 'source'), output = path.join(root, 'output'), calls = []
  await fs.mkdir(source)
  const files = ['package.json', 'package-lock.json', 'source.mjs']
  for (const file of [...files, 'windows-build-environment.ps1']) await fs.writeFile(path.join(source, file), file)
  const version = directory => createHash('sha256').update(files.map(file => readFileSync(path.join(directory, file))).join('')).digest('hex')
  const tools = { architecture: 'x64', tools: { visualStudio: true, cmake: 'cmake.exe', clang: 'C:\\LLVM\\bin', perl: 'perl.exe', rust: 'C:\\Cargo\\rustup.exe' }, environment: { Path: 'C:\\Native Tools', INCLUDE: 'sdk' } }
  const options = { source, output, platform: 'win32', arch: 'x64', files, version, env: { PATH: 'stale', SECRET: 'not serialized' }, log() {}, inspect: () => tools,
    installEngine({ target, run }) {
      run('cargo', ['vendor'], { cwd: target })
      writeFileSync(path.join(target, 'mew-desktop-engine.dll'), 'rust binary')
      mkdirSync(path.join(target, 'rust/vendor/crate'), { recursive: true })
      writeFileSync(path.join(target, 'rust/vendor/crate/.cargo-checksum.json'), '{}')
      writeFileSync(path.join(target, 'rust/vendor/crate/LICENSE'), 'vendor license')
    },
    run(command, args, settings) {
      calls.push({ command, args, settings })
      if (args.includes('ci')) {
        for (const name of ['koffi', 'node-datachannel']) {
          mkdirSync(path.join(settings.cwd, 'node_modules', name), { recursive: true })
          writeFileSync(path.join(settings.cwd, 'node_modules', name, 'package.json'), '{}')
        }
        writeFileSync(path.join(settings.cwd, 'node_modules/koffi/binding.node'), 'native binding')
      }
      if (args.some(value => value.endsWith('install-windows-gpu.ps1'))) writeFileSync(path.join(settings.cwd, 'gpu-windows.dll'), 'gpu binary')
      if (args.includes('-Output')) {
        const payload = args[args.indexOf('-Source') + 1]
        assert.equal(readFileSync(path.join(payload, 'rust/vendor/crate/.cargo-checksum.json'), 'utf8'), '{}')
        const manifest = JSON.parse(readFileSync(path.join(payload, 'mew-desktop-package.json'), 'utf8'))
        assert.equal(manifest.sourceHash, version(source))
        assert.ok(manifest.files.some(file => file.path === 'rust/vendor/crate/.cargo-checksum.json'))
        assert.ok(manifest.files.some(file => file.path === 'notices/mew-desktop-source/source.mjs'))
        writeFileSync(args[args.indexOf('-Output') + 1], 'zip fixture')
      }
      return { status: 0, stdout: '    KERNEL32.dll\r\n    api-ms-win-crt-runtime-l1-1-0.dll\r\n' }
    },
  }
  try { await run({ root, source, output, options, calls, tools, version }) }
  finally { await fs.rm(root, { recursive: true, force: true }) }
}

test('Windows release builds use isolated sources, prebuilts, explicit MSVC and preserve hidden corresponding sources', () => fixture(async ({ source, output, options, calls, version }) => {
  const result = await buildWindowsPackage(options)
  assert.equal(result.sourceHash, version(source))
  assert.equal(result.archive, path.join(output, 'mew-desktop-win32-x64.zip'))
  assert.equal(await fs.readFile(`${result.archive}.sha256`, 'utf8'), `${createHash('sha256').update('zip fixture').digest('hex')}  mew-desktop-win32-x64.zip\n`)
  const npm = calls.find(call => call.args.includes('ci'))
  assert.ok(npm.args.includes('--ignore-scripts'))
  assert.ok(npm.args.includes('--include=optional'))
  assert.notEqual(npm.settings.cwd, source)
  assert.equal(npm.settings.env.PATH, undefined)
  assert.equal(npm.settings.env.Path, 'C:\\Native Tools')
  assert.equal(npm.settings.env.RUSTFLAGS, '-C target-feature=+crt-static')
  assert.equal(npm.settings.env.CMAKE_MSVC_RUNTIME_LIBRARY, 'MultiThreaded')
  const vendor = calls.find(call => call.args.includes('vendor'))
  assert.equal(vendor.command, options.inspect().tools.rust)
  assert.deepEqual(vendor.args, ['run', 'stable-x86_64-pc-windows-msvc', 'cargo', 'vendor'])
  assert.equal(calls.filter(call => call.command === 'dumpbin.exe').length, 3)
  const probe = calls.find(call => call.args.includes('--input-type=module'))
  assert.match(probe.args.at(-1), /mew_gpu_abi.*5/s)
  assert.match(probe.args.at(-1), /mew_engine_abi.*1/s)
  assert.doesNotMatch(probe.args.at(-1), /mew_gpu_create|mew_engine_create/)
  await assert.rejects(fs.stat(npm.settings.cwd), { code: 'ENOENT' })
  await assert.rejects(fs.stat(path.join(source, 'node_modules')), { code: 'ENOENT' })
}))

test('builder refuses non-Windows hosts and missing or mismatched build prerequisites without installing tools', () => fixture(async ({ options, tools, calls }) => {
  await assert.rejects(buildWindowsPackage({ ...options, platform: 'linux' }), /native Windows/)
  tools.architecture = 'arm64'
  await assert.rejects(buildWindowsPackage(options), /native package architecture/)
  tools.architecture = 'x64'
  tools.tools.clang = null
  await assert.rejects(buildWindowsPackage(options), /release runner first: clang/)
  assert.deepEqual(calls, [])
}))

test('build failures and source changes never publish an artifact and clean the isolated directory', () => fixture(async ({ source, output, options, calls }) => {
  let target
  await assert.rejects(buildWindowsPackage({ ...options, run(command, args, settings) { target = settings.cwd; return { status: 1 } } }), /command failed/)
  await assert.rejects(fs.stat(target), { code: 'ENOENT' })
  await assert.rejects(fs.stat(output), { code: 'ENOENT' })
  const run = options.run
  await assert.rejects(buildWindowsPackage({ ...options, run(command, args, settings) {
    const result = run(command, args, settings)
    if (args.some(value => value.endsWith('install-windows-gpu.ps1'))) writeFileSync(path.join(source, 'source.mjs'), 'edited during build')
    return result
  } }), /sources changed during/)
  assert.ok(!calls.some(call => call.args.includes('-Output')))
  await assert.rejects(fs.stat(output), { code: 'ENOENT' })
}))

test('an npm native binding with an unbundled runtime dependency blocks package publication', () => fixture(async ({ output, options }) => {
  const run = options.run
  await assert.rejects(buildWindowsPackage({ ...options, run(command, args, settings) {
    if (command === 'dumpbin.exe' && args.at(-1).endsWith('binding.node')) return { status: 0, stdout: '    KERNEL32.dll\n    VCRUNTIME140.dll\n' }
    return run(command, args, settings)
  } }), /unbundled build\/runtime libraries: VCRUNTIME140.dll/)
  await assert.rejects(fs.stat(output), { code: 'ENOENT' })
}))

test('desktop build rejects dependencies on unbundled Visual C++ and OpenSSL runtimes', () => {
  verifyWindowsPackageDependencies('    KERNEL32.dll\n    ucrtbase.dll\n')
  verifyWindowsPackageDependencies('    KERNEL32.dll\n    bundled-runtime.dll\n', ['bundled-runtime.dll'])
  for (const name of ['VCRUNTIME140.dll', 'MSVCP140.dll', 'libcrypto-3-x64.dll', 'libssl-3.dll', 'unknown-library.dll']) {
    assert.throws(() => verifyWindowsPackageDependencies(`    KERNEL32.dll\n    ${name}\n`), /unbundled build\/runtime/)
  }
  assert.throws(() => verifyWindowsPackageDependencies('unrecognized output'), /Could not inspect/)
})

test('ZIP creation enumerates hidden files and creates slash-separated archive entries without Compress-Archive', () => {
  assert.match(windowsPackageZipScript, /Directory\]::EnumerateFiles/)
  assert.match(windowsPackageZipScript, /AllDirectories/)
  assert.match(windowsPackageZipScript, /Replace\('\\', '\/'\)/)
  assert.doesNotMatch(windowsPackageZipScript, /Compress-Archive|Get-ChildItem/)
})

const windowsPowerShell = process.platform === 'win32'
  ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe') : '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
test('real Windows PowerShell ZIP writer preserves hidden checksums and vendor paths over 300 characters', {
  skip: !existsSync(windowsPowerShell), timeout: 60_000,
}, () => fixture(async ({ root }) => {
  const windowsPath = file => process.platform === 'win32' ? file : execFileSync('wslpath', ['-w', file], { encoding: 'utf8' }).trim()
  const source = path.join(root, "package's sources"), archive = path.join(root, 'desktop.zip'), destination = path.join(root, 'extracted')
  const relative = `rust/vendor/${'very-long-vendor-directory/'.repeat(12)}.cargo-checksum.json`
  assert.ok(relative.length > 300)
  await fs.mkdir(path.dirname(path.join(source, relative)), { recursive: true })
  await fs.writeFile(path.join(source, relative), '{"package":"hidden source checksum"}')
  await fs.writeFile(path.join(source, '.hidden-notice'), 'hidden notice')
  const writer = path.join(root, 'writer.ps1')
  await fs.writeFile(writer, windowsPackageZipScript)
  const result = spawnSync(windowsPowerShell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', windowsPath(writer), '-Source', windowsPath(source), '-Output', windowsPath(archive)], { encoding: 'utf8', timeout: 20_000 })
  assert.equal(result.status, 0, result.stderr)
  const extractor = windowsPath(fileURLToPath(new URL('./extract-windows-package.ps1', import.meta.url)))
  const extracted = spawnSync(windowsPowerShell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', extractor, '-Archive', windowsPath(archive), '-Destination', windowsPath(destination)], { encoding: 'utf8', timeout: 20_000 })
  assert.equal(extracted.status, 0, extracted.stderr)
  assert.equal(await fs.readFile(path.join(destination, relative), 'utf8'), '{"package":"hidden source checksum"}')
  assert.equal(await fs.readFile(path.join(destination, '.hidden-notice'), 'utf8'), 'hidden notice')
}))

test('desktop releases build both native architectures and publish only matching source-hash tags behind approval', async () => {
  const workflow = parseYaml(await fs.readFile(new URL('../../.github/workflows/desktop-release.yml', import.meta.url), 'utf8'))
  assert.deepEqual(workflow.jobs.build.strategy.matrix.include.map(item => item.arch), ['x64', 'arm64'])
  assert.ok(workflow.jobs.build.steps.some(step => step.run === 'node tools/desktop-test-dependencies.mjs'))
  assert.ok(workflow.jobs.build.steps.some(step => step.run?.includes('windows-build-environment.test.mjs')))
  assert.equal(workflow.jobs.release.environment, 'desktop-release')
  assert.match(workflow.jobs.release.if, /github.ref_type == 'tag'/)
  assert.match(workflow.jobs.metadata.steps.find(step => step.id === 'source').run, /GITHUB_REF_NAME.*tag/s)
  assert.match(workflow.jobs.release.steps.find(step => step.name === 'Publish immutable desktop packages').run, /gh release view/)
})

test('desktop publishing rejects corrupt or mismatched packages and preserves an existing release', { skip: process.platform === 'win32' }, () => fixture(async ({ root }) => {
  const workflow = parseYaml(await fs.readFile(new URL('../../.github/workflows/desktop-release.yml', import.meta.url), 'utf8'))
  const script = workflow.jobs.release.steps.find(step => step.name === 'Publish immutable desktop packages').run
  const hash = 'a'.repeat(64), bin = path.join(root, 'bin'), published = path.join(root, 'published-assets')
  await fs.mkdir(bin)
  const gh = path.join(bin, 'gh')
  await fs.writeFile(gh, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[1] === 'view') process.exit(process.env.EXISTING_RELEASE === 'true' ? 0 : 1);
if (args[1] === 'download') { fs.cpSync(process.env.PUBLISHED_ASSETS, args[args.indexOf('--dir') + 1], {recursive:true}); process.exit(0); }
if (args[1] === 'create') { fs.writeFileSync(process.env.PUBLISH_RECORD, args.join(' ')); process.exit(0); }
throw new Error('Unexpected gh operation');
`)
  await fs.chmod(gh, 0o755)
  const python = `import hashlib,json,pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1]);root.mkdir(parents=True,exist_ok=True)
for arch in ['x64','arm64']:
 name='mew-desktop-win32-'+arch+'.zip'
 with zipfile.ZipFile(root/name,'w') as archive:
  archive.writestr('mew-desktop-package.json',json.dumps(dict(format=1,platform='win32',arch=arch,sourceHash=sys.argv[2])))
 (root/(name+'.sha256')).write_text(hashlib.sha256((root/name).read_bytes()).hexdigest()+'  '+name+'\\n')
`
  async function run(name, { sourceHash = hash, corrupt = false, existing = false } = {}) {
    const cwd = path.join(root, name), assets = path.join(cwd, 'artifacts'), record = path.join(cwd, 'published')
    await execute('python', ['-c', python, assets, sourceHash])
    if (corrupt) await fs.appendFile(path.join(assets, 'mew-desktop-win32-x64.zip'), 'corruption')
    await execute('/bin/bash', ['-e', '-c', script], { cwd, env: {
      ...process.env, PATH: `${bin}:${process.env.PATH}`, SOURCE_HASH: hash, RELEASE_TAG: `mew-desktop-${hash}`,
      REPOSITORY: 'fixture/repository', PUBLISH_RECORD: record, EXISTING_RELEASE: String(existing), PUBLISHED_ASSETS: published,
    } })
    return record
  }
  const record = await run('valid')
  assert.match(await fs.readFile(record, 'utf8'), /release create.*--verify-tag/)
  await assert.rejects(run('wrong-source', { sourceHash: 'b'.repeat(64) }), /Desktop source or architecture mismatch/)
  await assert.rejects(run('corrupt', { corrupt: true }), /FAILED|checksum/)
  const validAssets = path.join(root, 'valid', 'artifacts')
  await fs.cp(validAssets, published, { recursive: true })
  const existingRecord = await run('existing', { existing: true })
  await assert.rejects(fs.stat(existingRecord), { code: 'ENOENT' })
}))
