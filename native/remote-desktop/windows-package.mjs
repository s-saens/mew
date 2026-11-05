import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

export const WINDOWS_PACKAGE_MANIFEST = 'mew-desktop-package.json'
export const WINDOWS_PACKAGE_UNITS = ['node_modules', 'gpu-windows.dll', 'mew-desktop-engine.dll', 'rust/vendor', 'notices', WINDOWS_PACKAGE_MANIFEST]
export const WINDOWS_PACKAGE_LIMIT = 1024 * 1024 * 1024
const unpackedLimit = 4 * WINDOWS_PACKAGE_LIMIT
const fileLimit = 100_000

export function windowsPackageName(arch) {
  if (!['x64', 'arm64'].includes(arch)) throw new Error('Windows desktop packages support x64 and arm64.')
  return `mew-desktop-win32-${arch}.zip`
}

export function windowsPackagePath(file) {
  if (typeof file !== 'string' || file.length > 1024 || /[\\<>:"|?*]/.test(file) || Array.from(file).some(character => character.charCodeAt(0) < 32)
    || file.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part))
    || !/^(?:gpu-windows\.dll|mew-desktop-engine\.dll|node_modules\/.+|rust\/vendor\/.+|notices\/.+)$/.test(file)) throw new Error(`Invalid Windows desktop package path: ${file}`)
  return file
}

export async function windowsFileHash(file) {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(file)) hash.update(bytes)
  return hash.digest('hex')
}

export function windowsPackageChecksum(text, filename) {
  if (text.length > 64 * 1024) throw new Error('Desktop checksum list is too large.')
  const matches = text.split(/\r?\n/).map(line => /^([a-fA-F0-9]{64})\s+\*?([^\s]+)$/.exec(line)).filter(match => match?.[2] === filename)
  if (matches.length !== 1) throw new Error(`Missing or ambiguous desktop checksum: ${filename}`)
  return matches[0][1].toLowerCase()
}

async function packageFiles(directory) {
  const files = [], seen = new Set()
  let total = 0
  async function visit(relative) {
    for (const entry of await fs.readdir(path.join(directory, relative), { withFileTypes: true })) {
      const file = relative ? `${relative}/${entry.name}` : entry.name
      if (file === WINDOWS_PACKAGE_MANIFEST && entry.isFile()) continue
      if (entry.isSymbolicLink()) throw new Error(`Desktop package links are not supported: ${file}`)
      if (entry.isDirectory()) { await visit(file); continue }
      if (!entry.isFile()) throw new Error(`Invalid desktop package entry: ${file}`)
      windowsPackagePath(file)
      if (seen.has(file.toLowerCase())) throw new Error(`Duplicate Windows desktop package path: ${file}`)
      seen.add(file.toLowerCase())
      const absolute = path.join(directory, file), { size } = await fs.stat(absolute)
      total += size
      if (size > WINDOWS_PACKAGE_LIMIT || total > unpackedLimit || files.length >= fileLimit) throw new Error('Windows desktop package exceeds its size or file limit.')
      files.push({ path: file, size, sha256: await windowsFileHash(absolute) })
    }
  }
  await visit('')
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
}

function packageIdentity({ sourceHash, arch }) {
  windowsPackageName(arch)
  if (typeof sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(sourceHash)) throw new Error('Invalid desktop source hash.')
  return { format: 1, platform: 'win32', arch, sourceHash }
}

function requiredFiles(files) {
  const paths = new Set(files.map(file => file.path))
  for (const file of ['gpu-windows.dll', 'mew-desktop-engine.dll', 'node_modules/koffi/package.json', 'node_modules/node-datachannel/package.json']) {
    if (!paths.has(file)) throw new Error(`Required desktop package file is missing: ${file}`)
  }
  for (const prefix of ['rust/vendor/', 'notices/']) if (!files.some(file => file.path.startsWith(prefix))) throw new Error(`Desktop package sources or notices are missing: ${prefix}`)
}

export async function createWindowsPackageManifest(directory, identity) {
  const manifest = { ...packageIdentity(identity), files: await packageFiles(directory) }
  requiredFiles(manifest.files)
  await fs.writeFile(path.join(directory, WINDOWS_PACKAGE_MANIFEST), JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}

export async function validateWindowsPackage(directory, identity) {
  const manifestFile = path.join(directory, WINDOWS_PACKAGE_MANIFEST), stat = await fs.lstat(manifestFile)
  if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error('Invalid desktop package manifest.')
  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'))
  for (const [key, value] of Object.entries(packageIdentity(identity))) if (manifest[key] !== value) throw new Error(`Desktop package does not match this installation: ${key}`)
  if (!Array.isArray(manifest.files) || manifest.files.length > fileLimit) throw new Error('Invalid desktop package file list.')
  const seen = new Set()
  for (const file of manifest.files) {
    windowsPackagePath(file?.path)
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > WINDOWS_PACKAGE_LIMIT || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error(`Invalid desktop file metadata: ${file.path}`)
    if (seen.has(file.path.toLowerCase())) throw new Error(`Duplicate desktop manifest path: ${file.path}`)
    seen.add(file.path.toLowerCase())
  }
  requiredFiles(manifest.files)
  const actual = await packageFiles(directory)
  if (actual.length !== manifest.files.length) throw new Error('Desktop package contains missing or undeclared files.')
  const expected = new Map(manifest.files.map(file => [file.path, file]))
  for (const file of actual) {
    const match = expected.get(file.path)
    if (!match || match.size !== file.size || match.sha256 !== file.sha256) throw new Error(`Desktop package file checksum mismatch: ${file.path}`)
  }
  return manifest
}
