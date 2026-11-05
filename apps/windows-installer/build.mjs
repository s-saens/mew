import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const directory = path.dirname(fileURLToPath(import.meta.url))
const repository = 'https://github.com/s-saens/mew/releases/download'

export function createInstallerManifest(version, sums, downloads) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('The Windows installer requires a stable CLI version.')
  const name = 'mew-runtime-linux-x64.tar.gz'
  const matches = sums.split(/\r?\n/).map(line => /^([a-f0-9]{64})\s+\*?(\S+)$/.exec(line)).filter(match => match?.[2] === name)
  if (matches.length !== 1) throw new Error('The matching Linux x64 runtime release checksum is missing or ambiguous.')
  for (const item of [downloads.rootfs, downloads.node]) {
    if (!/^https:\/\//.test(item?.url) || !/^[a-f0-9]{64}$/.test(item?.sha256)) throw new Error('Installer prerequisite downloads must have pinned HTTPS identities.')
  }
  return { format: 1, arch: 'x64', rootfs: downloads.rootfs, node: downloads.node,
    runtime: { version, url: `${repository}/mew-cli-v${version}/${name}`, sha256: matches[0][1] } }
}

export async function buildWindowsInstaller({ root = path.resolve(directory, '../..'), output, platform = process.platform,
  compiler = process.env.MEW_INNO_COMPILER || path.win32.join(process.env.ProgramFiles || 'C:\\Program Files', 'Inno Setup 7', 'ISCC.exe'),
  node = process.execPath, npmCli = path.join(path.dirname(node), 'node_modules/npm/bin/npm-cli.js'), run = spawnSync, fetchImpl = fetch,
} = {}) {
  if (platform !== 'win32') throw new Error('Build the Windows installer on the Windows release runner.')
  if (!output) throw new Error('Installer output directory is required.')
  const source = path.join(root, 'apps/windows-installer'), cli = path.join(root, 'apps/cli')
  const { version } = JSON.parse(await fs.readFile(path.join(cli, 'package.json'), 'utf8'))
  const downloads = JSON.parse(await fs.readFile(path.join(source, 'downloads.json'), 'utf8'))
  const response = await fetchImpl(`${repository}/mew-cli-v${version}/SHA256SUMS`, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error('Publish and verify the matching immutable CLI runtime release before building its Windows installer.')
  const sums = await response.text()
  if (sums.length > 64 * 1024) throw new Error('Runtime release checksum list is too large.')
  const manifest = createInstallerManifest(version, sums, downloads)
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-windows-installer-'))
  const payload = path.join(temporary, 'payload')
  const execute = (command, args) => {
    const result = run(command, args, { stdio: 'inherit', cwd: temporary, timeout: 10 * 60_000 })
    if (result.error || result.status !== 0) throw new Error(`Installer packaging failed (${result.error?.message || result.signal || result.status}).`)
  }
  try {
    await fs.mkdir(path.join(payload, 'cli'), { recursive: true })
    for (const file of ['installer-core.ps1', 'install.ps1', 'launcher-core.ps1', 'launch.ps1', 'uninstall.ps1', 'bootstrap-linux.sh', 'launch-linux.sh', 'verify-linux.sh']) await fs.copyFile(path.join(source, file), path.join(payload, file))
    for (const folder of ['bin', 'src']) await fs.cp(path.join(cli, folder), path.join(payload, 'cli', folder), { recursive: true })
    for (const file of ['package.json', 'package-lock.json', 'LICENSE']) await fs.copyFile(path.join(cli, file), path.join(payload, 'cli', file))
    await fs.copyFile(path.join(root, 'LICENSE'), path.join(payload, 'LICENSE'))
    await fs.writeFile(path.join(payload, 'install-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
    execute(node, [npmCli, 'ci', '--prefix', path.join(payload, 'cli'), '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'])
    await fs.mkdir(output, { recursive: true })
    execute(compiler, [`/DMewVersion=${version}`, `/DPayload=${payload}`, `/O${path.resolve(output)}`, path.join(source, 'setup.iss')])
    const executable = path.join(output, 'mew-windows-setup-x64.exe')
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(executable)) hash.update(chunk)
    await fs.writeFile(`${executable}.sha256`, `${hash.digest('hex')}  ${path.basename(executable)}\n`)
    return executable
  } finally { await fs.rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.length !== 2 || args[0] !== '--output') throw new Error('Usage: node apps/windows-installer/build.mjs --output <directory>')
  console.log(await buildWindowsInstaller({ output: path.resolve(args[1]) }))
}
