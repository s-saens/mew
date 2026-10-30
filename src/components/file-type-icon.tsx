import { lazy, Suspense } from 'react'
import { fileIconId, folderIconId } from '../utils/file-icons'
import defaultArtwork from '../utils/file-icon-default-artwork.json'

const Artwork = lazy(() => import('./file-type-icon-image'))
const defaultIconUrls: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(defaultArtwork).map(([id, svg]) => [id, `data:image/svg+xml,${encodeURIComponent(svg)}`]),
)

function DefaultArtwork({ icon, size }: { icon: string; size: number }) {
  return <img data-file-icon={icon} src={defaultIconUrls[icon]} alt="" draggable={false} width={size} height={size} />
}

export function FolderTypeIcon({ open = false, size = 16 }: { open?: boolean; size?: number }) {
  return <span aria-hidden="true" className="pointer-events-none inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
    <DefaultArtwork icon={folderIconId(open)} size={size} />
  </span>
}

export function FileTypeIcon({ name, size = 16 }: { name: string; size?: number }) {
  const icon = fileIconId(name)
  const fallback = <DefaultArtwork icon="file" size={size} />
  return <span aria-hidden="true" className="pointer-events-none inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
    {icon === 'file' ? fallback : <Suspense fallback={fallback}>
      <Artwork icon={icon} lightIcon={fileIconId(name, true)} size={size} />
    </Suspense>}
  </span>
}
