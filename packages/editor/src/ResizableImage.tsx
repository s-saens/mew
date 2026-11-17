import { MediaPreviewDialog } from '@mew/ui'
import { uiText } from '@mew/ui/i18n-core'
import { Maximize } from 'iconoir-react'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { useContext, useEffect, useRef, useState } from 'react'
import { imageNode } from './imageSchema'
import { ImageEditingContext, ImageSourceContext } from './editor/image-source-context'

const MIN_WIDTH = 80

function ImageView({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) {
  const resolveSrc = useContext(ImageSourceContext)
  const editing = useContext(ImageEditingContext)
  const [preview, setPreview] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const latest = useRef({ editing, node })
  latest.current = { editing, node }
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { setPreview(false); setDrawing(false) }, [editing?.scope])
  const canEdit = editor.isEditable && !!editing?.renderDrawingEditor
  useEffect(() => { if (!canEdit) setDrawing(false) }, [canEdit])
  const src = resolveSrc(node.attrs.src ?? '')
  const name = node.attrs.alt || uiText('사진')
  async function saveImage(file: File) {
    const original = node.attrs.src, scope = editing?.scope
    const isCurrent = () => alive.current && !editor.isDestroyed && editor.isEditable && latest.current.editing?.scope === scope
      && latest.current.node.attrs.src === original && !!latest.current.editing?.renderDrawingEditor
    if (!editing || !isCurrent()) throw new Error(uiText('문서가 변경되었습니다. 그림판을 다시 여세요.'))
    const { url } = await editing.upload(file)
    const pos = getPos()
    if (!isCurrent() || pos === undefined || editor.state.doc.nodeAt(pos)?.attrs.src !== original) throw new Error(uiText('문서가 변경되었습니다. 그림판을 다시 여세요.'))
    updateAttributes({ src: url })
  }
  const imgRef = useRef<HTMLImageElement>(null)
  const [liveWidth, setLiveWidth] = useState<number | null>(null)
  const width = liveWidth ?? (node.attrs.width as number | null)

  function startResize(e: React.MouseEvent, dir: 1 | -1) {
    if (!editor.isEditable) return
    e.preventDefault()
    e.stopPropagation()
    const img = imgRef.current
    if (!img) return
    const startX = e.clientX
    const startWidth = img.offsetWidth
    const widthAt = (ev: MouseEvent) => Math.max(MIN_WIDTH, Math.round(startWidth + dir * (ev.clientX - startX)))
    const onMove = (ev: MouseEvent) => setLiveWidth(widthAt(ev))
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setLiveWidth(null)
      updateAttributes({ width: widthAt(ev) })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleClass =
    'absolute top-1/2 h-12 max-h-[50%] w-1.5 -translate-y-1/2 cursor-col-resize rounded-full bg-surface-inverse/70 opacity-0 transition-opacity group-hover:opacity-100'

  return (
    <NodeViewWrapper className="group relative my-2 w-fit max-w-full" data-drag-handle>
      <img
        ref={imgRef}
        src={src}
        alt={node.attrs.alt ?? ''}
        title={node.attrs.title ?? undefined}
        className={`block max-w-full rounded-md ${selected ? 'ring-2 ring-accent' : ''}`}
        style={width ? { width, height: 'auto' } : { height: 'auto', width: 'auto', maxHeight: '40vh' }}
        onDoubleClick={() => editor.isEditable && updateAttributes({ width: null })}
        draggable={false}
      />
      <button type="button" contentEditable={false} className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white hover:bg-black/85" aria-label={uiText('사진 확대')} data-tip={uiText('사진 확대')} onMouseDown={event => { event.preventDefault(); event.stopPropagation() }} onClick={event => { event.stopPropagation(); setPreview(true) }}><Maximize width={18} height={18} aria-hidden="true" /></button>
      {preview && !drawing && <MediaPreviewDialog src={src} name={name} kind="image" onClose={() => setPreview(false)} onEdit={canEdit ? () => setDrawing(true) : undefined} />}
      {drawing && editing?.renderDrawingEditor?.({ initialImage: { src, name }, onClose: () => setDrawing(false), onSave: saveImage })}
      {editor.isEditable && (
        <>
          <div className={`${handleClass} left-1`} onMouseDown={(e) => startResize(e, -1)} />
          <div className={`${handleClass} right-1`} onMouseDown={(e) => startResize(e, 1)} />
        </>
      )}
    </NodeViewWrapper>
  )
}

// 스키마·마크다운은 imageNode(React 없음, 서버와 공유)에 있고, 여기선 리사이즈 노드뷰만 얹는다.
export const ResizableImage = imageNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageView)
  },
})
