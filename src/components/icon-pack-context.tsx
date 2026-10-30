import type { ReactNode } from 'react'
import { normalizeIconPack, type IconPackId } from '../../shared/icon-packs'
import { IconPackContext } from '../hooks/use-icon-pack'

export function IconPackProvider({ value, children }: { value?: IconPackId; children: ReactNode }) {
  return <IconPackContext value={normalizeIconPack(value)}>{children}</IconPackContext>
}
