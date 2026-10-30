import { lazy, Suspense } from 'react'
import { Page } from 'iconoir-react'
import { fileIconId } from '../utils/file-icons'

const Artwork = lazy(() => import('./file-type-icon-image'))

export function FileTypeIcon({ name, size = 16 }: { name: string; size?: number }) {
  return <span aria-hidden="true" className="pointer-events-none inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
    <Suspense fallback={<Page width={size} height={size} className="text-ink-secondary" />}>
      <Artwork icon={fileIconId(name)} lightIcon={fileIconId(name, true)} size={size} />
    </Suspense>
  </span>
}
