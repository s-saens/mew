import defaults from '../utils/catppuccin-icon-default-artwork.json'
import { iconChunks, loadChunks, genericIcon, genericLightIcon } from '../utils/file-icon-chunks/catppuccin'
import { createChunkedIconArtwork } from './chunked-file-icon-artwork'

const CatppuccinIconImage = createChunkedIconArtwork({ defaults, iconChunks, loadChunks, genericIcon, genericLightIcon })
export default CatppuccinIconImage
