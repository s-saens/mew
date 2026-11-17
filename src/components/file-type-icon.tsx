import { lazy, Suspense } from 'react'
import { Folder, Page } from 'iconoir-react'
import { defaultIcons } from '../utils/file-icon-chunks/defaults'
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
  const ids = pack === 'none' ? null : defaultIcons[pack]
  const state = open ? 'folderExpanded' : 'folder'
  return <span aria-hidden="true" data-icon-pack={pack} className="pointer-events-none inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
    {DefaultArtwork && ids ? <DefaultArtwork icon={ids[state]} lightIcon={ids.light[state]} size={size} /> : <Folder width={size} height={size} />}
  </span>
}

export function FileTypeIcon({ name, size = 16 }: { name: string; size?: number }) {
  const pack = useIconPack()
  if (pack === 'none') return <span aria-hidden="true" data-icon-pack={pack} className="pointer-events-none inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}><Page width={size} height={size} /></span>
  const ids = defaultIcons[pack]
  const DefaultArtwork = defaults[pack], Artwork = artwork[pack]
  const fallback = <DefaultArtwork icon={ids.file} lightIcon={ids.light.file} size={size} />
  return <span aria-hidden="true" data-icon-pack={pack} className="pointer-events-none inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
    <Suspense fallback={fallback}><Artwork name={name} size={size} /></Suspense>
  </span>
}
