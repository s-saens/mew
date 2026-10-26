import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

/** Keep the pinned MPL source and its notices in place. Upstream's vendored
 * OpenSSL paths use Unix archive names even with the MSVC toolchain. */
export function windowsVendorSource(source) {
  let updated = source
  for (const library of ['crypto', 'ssl']) {
    const original = `.join("lib/lib${library}.a")`
    const replacement = `.join(if cfg!(target_env = "msvc") { "lib/lib${library}.lib" } else { "lib/lib${library}.a" })`
    if (updated.includes(replacement)) continue
    if (updated.split(original).length !== 2) throw new Error('잠금 버전의 datachannel-sys 빌드 소스와 일치하지 않습니다.')
    updated = updated.replace(original, replacement)
  }
  return updated
}

export function prepareRustVendor(vendor, platform = process.platform) {
  if (platform !== 'win32') return
  const root = path.join(vendor, 'datachannel-sys'), file = path.join(root, 'build.rs')
  // cargo vendor --versioned-dirs appends the complete Cargo package version.
  const versioned = `${root}-0.23.0+0.23.2`
  let directory = root
  try { readFileSync(file) } catch { directory = versioned }
  const build = path.join(directory, 'build.rs'), checksum = path.join(directory, '.cargo-checksum.json')
  const before = readFileSync(build, 'utf8'), after = windowsVendorSource(before)
  const sums = JSON.parse(readFileSync(checksum, 'utf8'))
  if (sums.files['build.rs'] !== createHash('sha256').update(before).digest('hex')) throw new Error('datachannel-sys 빌드 소스 체크섬이 다릅니다.')
  writeFileSync(build, after)
  sums.files['build.rs'] = createHash('sha256').update(after).digest('hex')
  writeFileSync(checksum, JSON.stringify(sums))
}
