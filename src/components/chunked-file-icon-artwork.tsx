import { useEffect, useState } from 'react'
import { createIconArtwork, type FileIconArtworkProps } from './file-icon-artwork'

type Artwork = Readonly<Record<string, string>>

export function createChunkedIconArtwork({ iconChunks, loadChunks, defaults, genericIcon, genericLightIcon }: {
  iconChunks: Readonly<Record<string, number>>
  loadChunks: ReadonlyArray<() => Promise<Artwork>>
  defaults: Artwork
  genericIcon: string
  genericLightIcon: string
}) {
  const artwork: Record<string, string> = { ...defaults }
  const pending = new Map<number, Promise<void>>()
  const Image = createIconArtwork(artwork)
  function load(index: number): Promise<void> {
    let request = pending.get(index)
    if (!request) {
      request = loadChunks[index]().then(chunk => { Object.assign(artwork, chunk) }, error => { pending.delete(index); throw error })
      pending.set(index, request)
    }
    return request
  }
  return function ChunkedIconArtwork({ icon, lightIcon, size }: FileIconArtworkProps) {
    const [, refresh] = useState(0)
    useEffect(() => {
      let active = true
      const chunks = [...new Set([icon, lightIcon].filter(id => !Object.hasOwn(artwork, id) && Object.hasOwn(iconChunks, id)).map(id => iconChunks[id]))]
      if (chunks.length) void Promise.all(chunks.map(load)).then(() => { if (active) refresh(value => value + 1) }, () => {})
      return () => { active = false }
    }, [icon, lightIcon])
    return Object.hasOwn(artwork, icon) && Object.hasOwn(artwork, lightIcon)
      ? <Image icon={icon} lightIcon={lightIcon} size={size} />
      : <Image icon={genericIcon} lightIcon={genericLightIcon} size={size} />
  }
}
