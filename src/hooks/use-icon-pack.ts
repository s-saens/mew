import { createContext, useContext } from 'react'
import { DEFAULT_ICON_PACK, type IconPackId } from '../../shared/icon-packs'

export const IconPackContext = createContext<IconPackId>(DEFAULT_ICON_PACK)

export function useIconPack(): IconPackId {
  return useContext(IconPackContext)
}
