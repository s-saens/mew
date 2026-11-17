import manifest from './file-icon-manifest.json' with { type: 'json' }
import catppuccin from './catppuccin-icon-manifest.json' with { type: 'json' }
import { DEFAULT_ICON_PACK, type IconPackId } from '../../shared/icon-packs.ts'
import { matchFileIcon, type IconManifest } from './file-icon-matching.ts'

const manifests: Record<Exclude<IconPackId, 'none'>, IconManifest> = { material: manifest, catppuccin }
const packManifest = (pack: IconPackId) => manifests[pack === 'none' ? 'material' : pack]

export function folderIconId(open = false, lightTheme = false, pack: IconPackId = DEFAULT_ICON_PACK): string {
  const manifest = packManifest(pack)
  const state = open ? 'folderExpanded' : 'folder'
  return (lightTheme ? manifest.light[state] : undefined) ?? manifest[state]
}

export function fileIconId(path: string, lightTheme = false, pack: IconPackId = DEFAULT_ICON_PACK): string {
  const defaults = packManifest(pack)
  if (pack === 'none') return (lightTheme ? defaults.light.file : undefined) ?? defaults.file
  return matchFileIcon(path, lightTheme, defaults)
}
