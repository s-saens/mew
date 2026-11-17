import { useEffect, useId, useRef, useState } from 'react'
import { EditPencil, Xmark } from 'iconoir-react'
import { DialogFrame } from './dialog-frame'
import { HoverTipLayer } from './HoverTipLayer'
import { uiText } from './i18n-core'
import { useUiLocale } from './i18n'
import './media-preview-dialog.css'

export function MediaPreviewDialog({ src, name, kind, onClose, onEdit }: {
  src: string; name: string; kind: 'image' | 'video'; onClose: () => void; onEdit?: () => void
}) {
  useUiLocale()
  const id = useId()
  const [closing, setClosing] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const close = () => {
    if (closing) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { onClose(); return }
    setClosing(true)
    timer.current = setTimeout(onClose, 120)
  }
  const label = kind === 'video' ? uiText('{p0} 동영상 미리보기', { p0: name }) : uiText('{p0} 사진 미리보기', { p0: name })
  return <DialogFrame labelledBy={id} onClose={close} className="media-preview-dialog" overlayClassName={`media-preview-overlay${closing ? ' is-closing' : ''}`}>
    <h2 id={id} className="sr-only">{label}</h2>
    <HoverTipLayer className="media-preview-content">
      {kind === 'video'
        // eslint-disable-next-line jsx-a11y/media-has-caption
        ? <video src={src} controls playsInline preload="metadata" aria-label={name} />
        : <img src={src} alt={name} />}
      <div className="media-preview-actions">
        {kind === 'image' && onEdit && <button type="button" disabled={closing} onClick={onEdit} aria-label={uiText('사진 편집')} data-tip={uiText('사진 편집')}><EditPencil aria-hidden="true" width={20} height={20} /></button>}
        <button type="button" disabled={closing} onClick={close} aria-label={kind === 'video' ? uiText('동영상 미리보기 닫기') : uiText('사진 미리보기 닫기')} data-tip={uiText('닫기')}><Xmark aria-hidden="true" width={20} height={20} /></button>
      </div>
    </HoverTipLayer>
  </DialogFrame>
}
