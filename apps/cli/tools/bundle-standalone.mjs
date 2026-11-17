import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import * as tar from 'tar'

const cliRoot = fileURLToPath(new URL('../', import.meta.url))
const defaultInstallerPath = fileURLToPath(new URL('../../../install.sh', import.meta.url))
const assetName = 'mew-cli-standalone.tar.gz'
const excluded = name => name.startsWith('.') || ['node_modules', 'test', 'tests', '__tests__', 'fixtures'].includes(name) || /\.(?:test|spec)\.[^.]+$/.test(name)

async function copyTree(source, destination) {
  const item = await fs.lstat(source)
  if (item.isSymbolicLink() || !item.isFile() && !item.isDirectory()) throw new Error(`Unsupported standalone input: ${source}`)
  if (item.isDirectory()) {
    await fs.mkdir(destination, { recursive: true, mode: 0o755 })
    for (const name of (await fs.readdir(source)).sort()) {
      if (!excluded(name)) await copyTree(path.join(source, name), path.join(destination, name))
    }
  } else {
    await fs.copyFile(source, destination)
    await fs.chmod(destination, item.mode & 0o111 ? 0o755 : 0o644)
  }
}

async function dependencyDirectory(name, from) {
  const require = createRequire(path.join(from, 'package.json'))
  let directory = path.dirname(require.resolve(name))
  for (;;) {
    try {
      const metadata = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'))
      if (metadata.name === name) return directory
    } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error }
    const parent = path.dirname(directory)
    if (directory === parent) throw new Error(`Could not resolve standalone dependency ${name}.`)
    directory = parent
  }
}

async function copyDependencies(source, destination, ancestry = new Set()) {
  const metadata = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8'))
  for (const name of [...new Set([...Object.keys(metadata.dependencies ?? {}), ...Object.keys(metadata.optionalDependencies ?? {})])].sort()) {
    if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name)) throw new Error(`Invalid standalone dependency name: ${name}`)
    let input
    try { input = await dependencyDirectory(name, source) } catch (error) {
      if (metadata.optionalDependencies?.[name] && error.code === 'MODULE_NOT_FOUND') continue
      throw new Error(`Standalone dependency ${name} is unavailable; run npm ci --prefix apps/cli.`, { cause: error })
    }
    const real = await fs.realpath(input)
    if (ancestry.has(real)) continue
    const output = path.join(destination, 'node_modules', name)
    await fs.mkdir(path.dirname(output), { recursive: true })
    await copyTree(input, output)
    await copyDependencies(input, output, new Set([...ancestry, real]))
  }
}

async function archiveEntries(directory, prefix = '') {
  const entries = []
  for (const name of (await fs.readdir(path.join(directory, prefix))).sort()) {
    const relative = prefix ? `${prefix}/${name}` : name
    entries.push(relative)
    if ((await fs.lstat(path.join(directory, relative))).isDirectory()) entries.push(...await archiveEntries(directory, relative))
  }
  return entries
}

export async function bundleStandalone({ packageRoot = cliRoot, output, installerPath = defaultInstallerPath } = {}) {
  if (!output) throw new Error('Specify the standalone output directory with --output <directory>.')
  const metadata = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'))
  if (metadata.name !== 'mew-ide' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(metadata.version)) throw new Error('Invalid standalone CLI package identity.')
  const installer = await fs.readFile(installerPath, 'utf8')
  const installedVersion = /^MEW_INSTALL_VERSION_DEFAULT=["']?([\w.-]+)["']?\s*$/m.exec(installer)?.[1]
  if (installedVersion !== metadata.version) throw new Error('install.sh must pin the standalone CLI package version.')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-standalone-'))
  try {
    const directory = path.join(temporary, 'cli')
    await fs.mkdir(directory)
    for (const name of ['package.json', 'LICENSE', 'bin', 'src']) await copyTree(path.join(packageRoot, name), path.join(directory, name))
    await fs.access(path.join(directory, 'bin/mew.mjs'))
    await fs.chmod(path.join(directory, 'bin/mew.mjs'), 0o755)
    await copyDependencies(packageRoot, directory)
    const archive = path.join(temporary, assetName)
    await tar.c({ file: archive, cwd: directory, portable: true, noMtime: true, noDirRecurse: true, gzip: true }, await archiveEntries(directory))
    const checksum = createHash('sha256').update(await fs.readFile(archive)).digest('hex')
    await fs.mkdir(output, { recursive: true })
    const target = path.resolve(output, assetName)
    await fs.copyFile(archive, target)
    await fs.writeFile(`${target}.sha256`, `${checksum}  ${assetName}\n`)
    await fs.writeFile(path.join(output, 'install.sh'), installer, { mode: 0o755 })
    const installerChecksum = createHash('sha256').update(installer).digest('hex')
    await fs.writeFile(path.join(output, 'install.sh.sha256'), `${installerChecksum}  install.sh\n`)
    return { archive: target, checksum, version: metadata.version }
  } finally { await fs.rm(temporary, { recursive: true, force: true }) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    if (args.length !== 2 || args[0] !== '--output') throw new Error('Usage: node apps/cli/tools/bundle-standalone.mjs --output <directory>')
    const result = await bundleStandalone({ output: args[1] })
    console.log(`${result.checksum}  ${path.basename(result.archive)}`)
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
