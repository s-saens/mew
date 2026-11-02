import defaults from '../utils/file-icon-default-artwork.json'
import { iconChunks, loadChunks, genericIcon, genericLightIcon } from '../utils/file-icon-chunks/material'
import { createChunkedIconArtwork } from './chunked-file-icon-artwork'

const MaterialIconImage = createChunkedIconArtwork({ defaults, iconChunks, loadChunks, genericIcon, genericLightIcon })
export default MaterialIconImage
