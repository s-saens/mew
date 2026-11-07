import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getBinding, matchesShortcut } from '@mew/shortcuts'
import { SHARED_MEMO_PATH } from '../../shared/shared-memo'
import { useMemoTabs } from './use-memo-tabs'
import { useMemoDocuments } from './use-memo-documents'
import { useMobileKeyboard } from './use-mobile-keyboard'
import { identityColor } from '../utils/collabColor'
import { useWorkspaceView } from '../workspace/workspace-view-context'

/** Owned above the project-keyed dock: closing or switching projects keeps the CRDT and pending edits. */
export function useSharedMemo({ authEmail, open, onOpenChange, focusSignal = 0, onFocus }: {
  authEmail: string; open: boolean; onOpenChange: (open: boolean) => void; focusSignal?: number; onFocus?: () => void
}) {
  const active = useWorkspaceView()?.active ?? true
  const keyboardOpen = useMobileKeyboard()
  const [activated, setActivated] = useState(false)
  const [selection, setSelection] = useState({ account: authEmail, id: SHARED_MEMO_PATH, visited: [] as string[] })
  const [viewMode, setViewMode] = useState<'hotview' | 'plain'>('hotview')
  const [colors, setColors] = useState<string[]>([])
  const root = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const tabs = useMemoTabs(authEmail, open)
  const selected = selection.account === authEmail && (!tabs.loaded || selection.id === SHARED_MEMO_PATH || tabs.tabs.some(tab => tab.id === selection.id)) ? selection.id : SHARED_MEMO_PATH
  const visited = selection.account === authEmail ? selection.visited.filter(id => tabs.tabs.some(tab => tab.id === id)) : []
  const { collab, value, setValue, documents, setDocumentValue } = useMemoDocuments(authEmail, tabs.ownerId, visited, activated, selected)
  const selectTab = (id: string) => {
    setSelection(old => ({ account: authEmail, id, visited: [...new Set([...(old.account === authEmail ? old.visited : []), ...(id === SHARED_MEMO_PATH ? [] : [id])])] }))
  }
  const focusEditor = useCallback(() => {
    if (!active) return
    const body = root.current?.querySelector<HTMLElement>('[data-memo-document]:not([hidden])')
    const editor = body?.querySelector<HTMLElement>(viewMode === 'plain' ? '.cm-content[contenteditable="true"]' : '.tiptap[contenteditable="true"]')
    ;(editor ?? root.current)?.focus({ preventScroll: true })
  }, [viewMode, active])
  const close = useCallback(() => {
    const restore = root.current?.contains(document.activeElement)
    onOpenChange(false)
    if (active && restore && previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true })
  }, [onOpenChange, active])
  useEffect(() => {
    if (!active) return
    function onKeyDown(event: KeyboardEvent) {
      if (!authEmail || event.isComposing || !matchesShortcut(event, getBinding('toggleMemo'))) return
      event.preventDefault(); event.stopImmediatePropagation()
      if (event.repeat) return
      if (open && root.current?.contains(document.activeElement)) { close(); return }
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      if (open) { onFocus?.(); focusEditor(); requestAnimationFrame(focusEditor) }
      else { setActivated(true); onOpenChange(true) }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [authEmail, open, close, focusEditor, onOpenChange, onFocus, active])
  useLayoutEffect(() => {
    if (!open) return
    setActivated(true)
    if (!active) return
    if (!root.current?.contains(document.activeElement)) previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => root.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [open, activated, focusSignal, active])
  useEffect(() => {
    const awareness = collab?.awareness
    for (const [id, document] of Object.entries(documents)) {
      const awareness = document.collab.awareness, current = awareness.getLocalState()
      if (open && id === selected) {
        if (current?.user?.memoViewer !== authEmail) awareness.setLocalState({ ...current,
          user: { ...current?.user, name: authEmail.split('@')[0], color: identityColor(authEmail), memoViewer: authEmail } })
      } else if (current !== null) awareness.setLocalState(null)
    }
    if (!awareness) { setColors([]); return }
    const update = () => {
      const viewers = new Map<string, string>()
      if (open && collab.connected) for (const state of awareness.getStates().values()) {
        const user = state.user
        if (typeof user?.memoViewer === 'string' && typeof user.color === 'string') viewers.set(user.memoViewer, user.color)
      }
      const next = [...viewers.values()]
      setColors(previous => previous.length === next.length && previous.every((color, index) => color === next[index]) ? previous : next)
    }
    update()
    awareness.on('change', update)
    return () => { awareness.off('change', update) }
  }, [collab?.awareness, collab?.connected, open, authEmail, documents, selected])

  return { root, value, setValue, viewMode, setViewMode, colors, collab, keyboardOpen, close, activated, tabs, selected, selectTab, documents, setDocumentValue }
}
export type SharedMemoSession = ReturnType<typeof useSharedMemo>
