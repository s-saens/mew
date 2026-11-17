import defaults from '../utils/catppuccin-icon-default-artwork.json'
import manifest from '../utils/catppuccin-icon-manifest.json'
import { matchFileIcon } from '../utils/file-icon-matching'
import { iconChunks, loadChunks, genericIcon, genericLightIcon } from '../utils/file-icon-chunks/catppuccin'
import { createChunkedIconArtwork } from './chunked-file-icon-artwork'

const Image = createChunkedIconArtwork({ defaults, iconChunks, loadChunks, genericIcon, genericLightIcon })
export default function CatppuccinIconImage({ name, size }: { name: string; size: number }) {
  return <Image icon={matchFileIcon(name, false, manifest)} lightIcon={matchFileIcon(name, true, manifest)} size={size} />
}
