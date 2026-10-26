import type { MewcatActivity, MewcatAnimation, SpriteStrip } from './mewcat-sprites'

export function paintSpriteFrame(svg: SVGSVGElement, strip: SpriteStrip, frame: number, action: MewcatActivity | MewcatAnimation = 'idle'): void {
  const scale = action === 'fall' || action === 'land' ? 0.83 : 1
  if (svg.dataset.source === strip.src && svg.dataset.frame === String(frame) && svg.dataset.scale === String(scale)) return
  svg.dataset.source = strip.src
  svg.dataset.frame = String(frame)
  svg.dataset.scale = String(scale)
  const width = strip.width / strip.frames
  const viewWidth = width / scale, viewHeight = strip.height / scale
  svg.setAttribute('viewBox', `${(width - viewWidth) / 2} ${strip.height - viewHeight} ${viewWidth} ${viewHeight}`)
  const image = svg.querySelector('image')!
  image.setAttribute('href', strip.src)
  image.setAttribute('width', String(strip.width))
  image.setAttribute('height', String(strip.height))
  image.setAttribute('x', String(-frame * width))
  image.style.clipPath = `inset(0 ${(strip.frames - frame - 1) * width}px 0 ${frame * width}px)`
  svg.querySelector('g')!.setAttribute('transform', `scale(${width / 48} ${strip.height / 48})`)
  svg.querySelector('path')!.setAttribute('d', strip.hitPaths[frame])
}
