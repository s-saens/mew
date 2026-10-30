import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateManifest } from 'material-icon-theme'

const root = fileURLToPath(new URL('../', import.meta.url))
const manifest = generateManifest()
const normalize = entries => Object.fromEntries(Object.entries(entries).map(([key, value]) => [key.toLowerCase(), value]))
const mappings = {
  file: manifest.file,
  fileNames: normalize(manifest.fileNames),
  fileExtensions: normalize(manifest.fileExtensions),
  light: {
    fileNames: normalize(manifest.light.fileNames),
    fileExtensions: normalize(manifest.light.fileExtensions),
  },
}
const ids = [...new Set([mappings.file, ...[mappings, mappings.light].flatMap(theme => [
  ...Object.values(theme.fileNames), ...Object.values(theme.fileExtensions),
])])].sort()
const artwork = Object.fromEntries(await Promise.all(ids.map(async id => {
  const filename = path.basename(manifest.iconDefinitions[id].iconPath)
  return [id, await fs.readFile(path.join(root, 'node_modules/material-icon-theme/icons', filename), 'utf8')]
})))
for (const [file, content] of [
  ['src/utils/file-icon-manifest.json', JSON.stringify(mappings, null, 2) + '\n'],
  ['src/utils/file-icon-artwork.json', JSON.stringify(artwork, null, 2) + '\n'],
  ['public/licenses/material-icon-theme.txt', await fs.readFile(path.join(root, 'node_modules/material-icon-theme/LICENSE'), 'utf8')],
]) {
  const target = path.join(root, file)
  if (process.argv.includes('--check')) {
    if (await fs.readFile(target, 'utf8') !== content) throw new Error(`Regenerate file icons: ${file}`)
  } else {
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, content)
  }
}
