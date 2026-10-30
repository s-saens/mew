import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const sourceFile = 'src/utils/catppuccin-icon-source.json'
const source = {
  name: 'Catppuccin Icons',
  version: '1.26.0',
  repository: 'https://github.com/catppuccin/vscode-icons',
  commit: 'b6915da9f6889b683a110aa747de96c2820a537d',
  archive: 'https://github.com/catppuccin/vscode-icons/releases/download/v1.26.0/catppuccin-vsc-icons-1.26.0.vsix',
  sha256: '57566136d0a8ba8d040eb6e5be866c88ccbb04f3d219d3a7e52a19978900ff3d',
  license: 'MIT',
  licenseUrl: 'https://github.com/catppuccin/vscode-icons/blob/b6915da9f6889b683a110aa747de96c2820a537d/LICENSE',
  licenseFile: 'public/licenses/catppuccin-icons.txt',
  variants: { dark: 'mocha', light: 'latte' },
}
const digest = value => createHash('sha256').update(value).digest('hex')
const json = value => JSON.stringify(value, null, 2) + '\n'
const check = process.argv.includes('--check')
const sourceIndex = process.argv.indexOf('--source')
const sourcePath = sourceIndex < 0 ? undefined : process.argv[sourceIndex + 1]
if (sourceIndex >= 0 && (!sourcePath || sourcePath.startsWith('--'))) throw new Error('--source requires a VSIX path')

// The standard check stays offline. Supplying --source also verifies reproducibility
// against the original, hash-pinned data archive without running extension code.
if (check && !sourcePath) {
  const metadata = JSON.parse(await fs.readFile(path.join(root, sourceFile), 'utf8'))
  for (const [key, value] of Object.entries(source)) {
    if (JSON.stringify(metadata[key]) !== JSON.stringify(value)) throw new Error(`Unexpected Catppuccin source: ${key}`)
  }
  const requiredFiles = [
    'src/utils/catppuccin-icon-manifest.json',
    'src/utils/catppuccin-icon-artwork.json',
    'src/utils/catppuccin-icon-default-artwork.json',
    source.licenseFile,
  ]
  if (JSON.stringify(Object.keys(metadata.generated)) !== JSON.stringify(requiredFiles)) throw new Error('Unexpected Catppuccin output list')
  for (const file of requiredFiles) {
    if (digest(await fs.readFile(path.join(root, file))) !== metadata.generated[file]) throw new Error(`Regenerate file icons: ${file}`)
  }
} else {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-catppuccin-icons-'))
  try {
    let archive
    if (sourcePath) {
      archive = await fs.readFile(path.resolve(sourcePath))
    } else {
      const response = await fetch(source.archive)
      if (!response.ok) throw new Error(`Catppuccin archive download failed: ${response.status}`)
      archive = Buffer.from(await response.arrayBuffer())
    }
    if (digest(archive) !== source.sha256) throw new Error('Catppuccin archive SHA-256 mismatch')
    const archivePath = path.join(temporary, 'source.vsix')
    await fs.writeFile(archivePath, archive)
    execFileSync('unzip', ['-q', archivePath, 'extension/dist/mocha/*', 'extension/dist/latte/*', 'extension/LICENSE.txt', 'extension/package.json', '-d', temporary])
    const packageInfo = JSON.parse(await fs.readFile(path.join(temporary, 'extension/package.json'), 'utf8'))
    if (packageInfo.version !== source.version || packageInfo.license !== source.license) throw new Error('Unexpected Catppuccin package version or license')
    const artwork = {}
    const defaults = {}
    const themes = {}
    for (const flavor of ['mocha', 'latte']) {
      const directory = path.join(temporary, 'extension/dist', flavor)
      const manifest = JSON.parse(await fs.readFile(path.join(directory, 'theme.json'), 'utf8'))
      const idFor = id => `${flavor}-${id}`
      const normalize = entries => Object.fromEntries(Object.entries(entries).map(([key, value]) => [key.toLowerCase(), idFor(value)]))
      const mapping = {
        file: idFor(manifest.file),
        folder: idFor(manifest.folder),
        folderExpanded: idFor(manifest.folderExpanded),
        fileNames: normalize(manifest.fileNames),
        fileExtensions: normalize(manifest.fileExtensions),
        folderNames: normalize(manifest.folderNames),
        folderNamesExpanded: normalize(manifest.folderNamesExpanded),
      }
      const ids = [...new Set([
        manifest.file, manifest.folder, manifest.folderExpanded,
        ...['fileNames', 'fileExtensions', 'folderNames', 'folderNamesExpanded'].flatMap(key => Object.values(manifest[key])),
      ])].sort()
      for (const id of ids) {
        const iconPath = manifest.iconDefinitions[id].iconPath
        if (!/^\.\/icons\/[\w-]+\.svg$/.test(iconPath)) throw new Error(`Unexpected icon path: ${iconPath}`)
        const svg = await fs.readFile(path.join(directory, iconPath), 'utf8')
        const externalUrls = [...svg.matchAll(/url\s*\(([^)]*)\)/gi)].some(([, value]) => !/^['"]?#[\w-]+['"]?$/.test(value.trim()))
        if (!svg.startsWith('<svg ') || /<script\b|<foreignObject\b|\bon\w+\s*=|(?:href|src)\s*=/i.test(svg) || externalUrls) throw new Error(`Unexpected active SVG content: ${id}`)
        artwork[idFor(id)] = svg
      }
      for (const id of [manifest.file, manifest.folder, manifest.folderExpanded]) defaults[idFor(id)] = artwork[idFor(id)]
      themes[flavor] = mapping
    }
    const outputs = {
      'src/utils/catppuccin-icon-manifest.json': json({ ...themes.mocha, light: themes.latte }),
      'src/utils/catppuccin-icon-artwork.json': json(artwork),
      'src/utils/catppuccin-icon-default-artwork.json': json(defaults),
      [source.licenseFile]: await fs.readFile(path.join(temporary, 'extension/LICENSE.txt'), 'utf8'),
    }
    outputs[sourceFile] = json({ ...source, generated: Object.fromEntries(Object.entries(outputs).map(([file, content]) => [file, digest(content)])) })
    for (const [file, content] of Object.entries(outputs)) {
      const target = path.join(root, file)
      if (check) {
        if (await fs.readFile(target, 'utf8') !== content) throw new Error(`Regenerate file icons: ${file}`)
      } else {
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.writeFile(target, content)
      }
    }
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
}
