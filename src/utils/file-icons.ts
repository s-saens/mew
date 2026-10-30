import manifest from './file-icon-manifest.json' with { type: 'json' }
import catppuccin from './catppuccin-icon-manifest.json' with { type: 'json' }
import { DEFAULT_ICON_PACK, type IconPackId } from '../../shared/icon-packs.ts'

type Associations = { fileNames: Record<string, string>; fileExtensions: Record<string, string> }
type Manifest = Associations & { file: string; folder: string; folderExpanded: string; light: Associations & Partial<{ file: string; folder: string; folderExpanded: string }> }
const manifests: Record<Exclude<IconPackId, 'none'>, Manifest> = { material: manifest, catppuccin }
const packManifest = (pack: IconPackId) => manifests[pack === 'none' ? 'material' : pack]

export function folderIconId(open = false, lightTheme = false, pack: IconPackId = DEFAULT_ICON_PACK): string {
  const manifest = packManifest(pack)
  const state = open ? 'folderExpanded' : 'folder'
  return (lightTheme ? manifest.light[state] : undefined) ?? manifest[state]
}

export function fileIconId(path: string, lightTheme = false, pack: IconPackId = DEFAULT_ICON_PACK): string {
  const defaults = packManifest(pack), light = defaults.light
  const fallback = (lightTheme ? light.file : undefined) ?? defaults.file
  if (pack === 'none') return fallback
  const normalized = path.replaceAll('\\', '/').toLowerCase()
  const name = normalized.split('/').at(-1)!
  const exact = (table: Record<string, string>, key: string) => Object.hasOwn(table, key) ? table[key] : undefined
  const match = (kind: keyof Associations, key: string) =>
    (lightTheme ? exact(light[kind], key) : undefined) ?? exact(defaults[kind], key)
  for (let start = 0; start <= normalized.length;) {
    const named = match('fileNames', normalized.slice(start))
    if (named) return named
    const slash = normalized.indexOf('/', start)
    if (slash === -1) break
    start = slash + 1
  }
  for (let dot = name.indexOf('.'); dot !== -1; dot = name.indexOf('.', dot + 1)) {
    const extension = match('fileExtensions', name.slice(dot + 1))
    if (extension) return extension
  }
  return fallback
}
