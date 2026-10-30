import type { IconPackId } from '../../shared/icon-packs'

export const ICON_PACKS: readonly { id: IconPackId; name?: string; source?: string; license?: string; notices?: string }[] = [
  { id: 'material', name: 'Material Icon Theme', source: 'https://github.com/material-extensions/vscode-material-icon-theme', license: '/licenses/material-icon-theme.txt', notices: '/licenses/material-icon-theme-notices.txt' },
  { id: 'catppuccin', name: 'Catppuccin', source: 'https://github.com/catppuccin/vscode-icons/tree/b6915da9f6889b683a110aa747de96c2820a537d', license: '/licenses/catppuccin-icons.txt' },
  { id: 'none' },
]
