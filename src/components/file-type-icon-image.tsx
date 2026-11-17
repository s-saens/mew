import defaults from '../utils/file-icon-default-artwork.json'
import manifest from '../utils/file-icon-manifest.json'
import { matchFileIcon } from '../utils/file-icon-matching'
import { iconChunks, loadChunks, genericIcon, genericLightIcon } from '../utils/file-icon-chunks/material'
import { createChunkedIconArtwork } from './chunked-file-icon-artwork'

const Image = createChunkedIconArtwork({ defaults, iconChunks, loadChunks, genericIcon, genericLightIcon })
export default function MaterialIconImage({ name, size }: { name: string; size: number }) {
  return <Image icon={matchFileIcon(name, false, manifest)} lightIcon={matchFileIcon(name, true, manifest)} size={size} />
}
