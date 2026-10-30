export type IconPackId = 'material' | 'catppuccin' | 'none'

export const DEFAULT_ICON_PACK: IconPackId = 'material'

export function normalizeIconPack(value: unknown): IconPackId {
  return value === 'catppuccin' || value === 'none' ? value : DEFAULT_ICON_PACK
}
