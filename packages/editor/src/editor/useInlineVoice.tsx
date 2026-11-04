import type { Editor } from '@tiptap/core'
import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { EditorApi } from '../types'
import { inlineVoiceKey } from './inlineVoice'
import { VoiceRecordingBlock } from './VoiceRecordingBlock'

interface Session { editor: Editor; path: string; api: EditorApi; mount: HTMLElement; abort: AbortController }

export function useInlineVoice(editor: Editor | null, path: string, api: EditorApi, readOnly: boolean) {
  const [session, setSession] = useState<Session | null>(null)
  const active = useRef<Session | null>(null)
  const context = useRef({ editor, path, api, readOnly })
  useLayoutEffect(() => { context.current = { editor, path, api, readOnly } }, [editor, path, api, readOnly])
  function current(value: Session) {
    const ctx = context.current
    return active.current === value && ctx.editor === value.editor && ctx.path === value.path && ctx.api === value.api
      && !ctx.readOnly && !value.editor.isDestroyed && value.editor.isEditable && !value.abort.signal.aborted
  }
  function close(value: Session) {
    value.abort.abort()
    if (active.current !== value) return
    active.current = null
    if (!value.editor.isDestroyed) value.editor.view.dispatch(value.editor.state.tr.setMeta(inlineVoiceKey, null))
    setSession(null)
  }
  useLayoutEffect(() => {
    if (!editor) return
    const check = () => {
      const value = active.current
      if (value && (!current(value) || !inlineVoiceKey.getState(editor.state)?.find().length)) close(value)
    }
    editor.on('transaction', check)
    const destroy = () => { if (active.current) close(active.current) }
    editor.on('destroy', destroy)
    return () => {
      editor.off('transaction', check)
      editor.off('destroy', destroy)
      if (active.current) close(active.current)
    }
  }, [editor, path, api, readOnly])
  function open(target: Editor, range: { from: number; to: number }) {
    if (active.current || readOnly || !target.isEditable) return
    const mount = target.view.dom.ownerDocument.createElement('span')
    mount.contentEditable = 'false'
    mount.className = 'mew-voice-mount'
    const value: Session = { editor: target, path, api, mount, abort: new AbortController() }
    target.chain().deleteRange(range).command(({ tr }) => {
      tr.setMeta(inlineVoiceKey, { pos: range.from, mount })
      return true
    }).run()
    active.current = value
    setSession(value)
  }
  async function save(value: Session, file: File) {
    if (!current(value)) return
    const { url } = await value.api.uploadAsset(file)
    if (!current(value)) return
    const pos = inlineVoiceKey.getState(value.editor.state)?.find()[0]?.from
    if (pos === undefined) { close(value); return }
    // Clear the widget in the same transaction that inserts the persistent media node.
    value.editor.chain().command(({ tr }) => { tr.setMeta(inlineVoiceKey, null); return true })
      .insertContentAt(pos, { type: 'audio', attrs: { src: url } }).run()
    close(value)
  }
  return {
    open,
    portal: session && !readOnly ? createPortal(<VoiceRecordingBlock signal={session.abort.signal}
      onSave={file => save(session, file)} onCancel={() => close(session)} />, session.mount) : null,
  }
}
