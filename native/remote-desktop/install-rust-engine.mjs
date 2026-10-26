import { spawnSync } from 'node:child_process'
import { existsSync, renameSync, rmSync, copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rustLibrary } from './rust-engine.mjs'
import { prepareRustVendor } from './rust-vendor.mjs'

/** Compile locally. Keep locked dependency sources and their notices beside the
 * installed binary, including MPL libdatachannel and its bundled libraries. */
export function installRustEngine({ target, platform = process.platform, run = spawnSync, exists = existsSync, copy = copyFileSync, rename = renameSync, remove = file => rmSync(file, { force: true }), mkdir = directory => mkdirSync(directory, { recursive: true }), prepareVendor = prepareRustVendor, log = console.log }) {
  const manifest = path.join(target, 'rust', 'Cargo.toml'), output = path.join(target, rustLibrary(platform)), temporary = `${output}.tmp`
  const execute = (command, args) => {
    const result = run(command, args, { cwd: target, stdio: 'inherit', timeout: 20 * 60 * 1000 })
    if (result.error || result.status !== 0) throw new Error('Rust 영상 모듈 준비에 실패했습니다. Rust stable·CMake·libclang·C++ 컴파일러·Perl과 플랫폼 SDK를 확인해 주세요.')
  }
  log('Preparing the Rust desktop engine (first compilation can take several minutes)...')
  remove(temporary)
  try {
    const vendor = path.join(target, 'rust', 'vendor')
    mkdir(path.dirname(vendor))
    execute('cargo', ['vendor', '--locked', '--versioned-dirs', '--manifest-path', manifest, vendor])
    prepareVendor(vendor, platform)
    execute('cargo', ['build', '--release', '--locked', '--offline', '--manifest-path', manifest,
      '--config', 'source.crates-io.replace-with="vendored-sources"', '--config', `source.vendored-sources.directory=${JSON.stringify(vendor)}`])
    const binary = path.join(target, 'rust', 'target', 'release', platform === 'win32' ? 'mew_desktop_engine.dll' : rustLibrary(platform))
    if (!exists(binary)) throw new Error('Rust 영상 모듈 파일이 생성되지 않았습니다.')
    copy(binary, temporary)
    if (platform === 'darwin') {
      execute('/usr/bin/codesign', ['--force', '--sign', '-', temporary])
      execute('/usr/bin/codesign', ['--verify', '--strict', temporary])
    }
    rename(temporary, output)
    // Sign after every nested native library has reached its final path.
    if (platform === 'darwin') {
      execute('/usr/bin/codesign', ['--force', '--sign', '-', '--identifier', 'dev.liiiiv.mew.desktop', path.join(target, 'MewDesktop.app')])
      execute('/usr/bin/codesign', ['--verify', '--strict', path.join(target, 'MewDesktop.app')])
    }
    const probe = "import koffi from 'koffi'; const lib=koffi.load(process.argv[1]); if(lib.func('int mew_engine_abi()')()!==1) process.exit(1)"
    execute(process.execPath, ['--input-type=module', '-e', probe, output])
  } finally { remove(temporary) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { installRustEngine({ target: path.dirname(fileURLToPath(import.meta.url)) }) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
