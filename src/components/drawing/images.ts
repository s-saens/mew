import { createObject } from './model'
import { mewFetch } from '../../utils/remote-transport'
import { uiText } from '@mew/ui/i18n-core'

export async function loadDrawingImage(src: string, signal: AbortSignal) {
  const response = await mewFetch(src, { signal })
  if (!response.ok) throw new Error(uiText('이미지를 추가하지 못했습니다.'))
  const blob = await response.blob()
  if (blob.size > 20 * 1024 * 1024) throw new Error(uiText('이미지는 20MB 이하로 추가해 주세요.'))
  // Rasterizing also accepts SVG previews while keeping drawing metadata portable.
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image(); image.src = url; await image.decode()
    signal.throwIfAborted()
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 8192 / image.naturalWidth, 8192 / image.naturalHeight, Math.sqrt(16_777_216 / (image.naturalWidth * image.naturalHeight)))
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error(uiText('이미지를 추가하지 못했습니다.'))
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return createObject('image', { x: -canvas.width / 2, y: -canvas.height / 2, width: canvas.width, height: canvas.height, src: canvas.toDataURL('image/png'), fill: 'none', stroke: 'none' })
  } finally { URL.revokeObjectURL(url) }
}
