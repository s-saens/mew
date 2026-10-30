import { lazy, Suspense } from 'react'
import { Folder, Page } from 'iconoir-react'
import { fileIconId, folderIconId } from '../utils/file-icons'
import defaultArtwork from '../utils/file-icon-default-artwork.json'
import catppuccinDefaults from '../utils/catppuccin-icon-default-artwork.json'
import { createIconArtwork } from './file-icon-artwork'
import { useIconPack } from '../hooks/use-icon-pack'

const artwork = {
  material: lazy(() => import('./file-type-icon-image')),
  catppuccin: lazy(() => import('./catppuccin-file-icon-image')),
}
const defaults = { material: createIconArtwork(defaultArtwork), catppuccin: createIconArtwork(catppuccinDefaults) }

export function FolderTypeIcon({ open = false, size = 16 }: { open?: boolean; size?: number }) {
  const pack = useIconPack()
  const DefaultArtwork = pack === 'none' ? null : defaults[pack]
  return <span aria-hidden="true" data-icon-pack={pack} className="pointer-events-none inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
    {DefaultArtwork ? <DefaultArtwork icon={folderIconId(open, false, pack)} lightIcon={folderIconId(open, true, pack)} size={size} /> : <Folder width={size} height={size} />}
  </span>
}

export function FileTypeIcon({ name, size = 16 }: { name: string; size?: number }) {
  const pack = useIconPack()
  if (pack === 'none') return <span aria-hidden="true" data-icon-pack={pack} className="pointer-events-none inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}><Page width={size} height={size} /></span>
  const icon = fileIconId(name, false, pack), lightIcon = fileIconId(name, true, pack)
  const DefaultArtwork = defaults[pack], Artwork = artwork[pack]
  const fallback = <DefaultArtwork icon={fileIconId('', false, pack)} lightIcon={fileIconId('', true, pack)} size={size} />
  return <span aria-hidden="true" data-icon-pack={pack} className="pointer-events-none inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
    {icon === fileIconId('', false, pack) && lightIcon === fileIconId('', true, pack) ? fallback : <Suspense fallback={fallback}>
      <Artwork icon={icon} lightIcon={lightIcon} size={size} />
    </Suspense>}
  </span>
}
