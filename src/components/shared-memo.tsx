import { ToolPresentationToggle } from './tool-presentation-toggle'
import { PanelCloseButton } from './panel-close-button'
import { useEffect, useRef, useState } from 'react'
import { Notes } from 'iconoir-react'
import { Editor, type EditorHandle } from '@mew/editor'
import { ConfirmDialog, HoverTipLayer, LoadingIndicator, TabScrollArea } from '@mew/ui'
import { uiText } from '@mew/ui/i18n-core'
import { useUiLocale } from '@mew/ui/i18n'
import { editorApi } from '../api/client'
import type { SharedMemoSession } from '../hooks/use-shared-memo'
import { PresenceDots } from './PresenceDots'
import { DockGrip, DockInlineBody } from './DockWorkspace'
import { CodePane } from './CodePane'
import { SHARED_MEMO_PATH } from '../../shared/shared-memo'
import { memoCopy, memoTabName } from './memo-copy'
import type { Collab } from '../utils/collab-connection'
import './shared-memo.css'

const memoApi = { ...editorApi, fetchTableLayout: undefined, saveTableLayout: undefined }

function MemoBody({ id, collab, value, onChange, viewMode, showMobileKeyBar }: {
  id: string; collab: Collab; value: string; onChange: (value: string) => void
  viewMode: 'hotview' | 'plain'; showMobileKeyBar: boolean
}) {
  const editorRef = useRef<EditorHandle>(null)
  return <>
    {/* Both views use one fragment. Keep visited Hotview editors alive for undo and remote updates. */}
    <div hidden={viewMode !== 'hotview'} className="h-full">
      <Editor ref={editorRef} value={value} onChange={onChange} api={memoApi} collab={collab} readOnly={!collab.connected} showMobileKeyBar={showMobileKeyBar} />
    </div>
    {viewMode === 'plain' && <CodePane path={id} value={value}
      onChange={content => editorRef.current?.setRawContent(content)} readOnly={!collab.connected} />}
  </>
}

export function SharedMemo({ session, open }: { session: SharedMemoSession; open: boolean }) {
  useUiLocale()
  const initialOpen = useRef(open)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const { root, value, setValue, viewMode, setViewMode, colors, collab, keyboardOpen, close, activated, tabs, selected, selectTab, documents, setDocumentValue } = session
  const copy = memoCopy()
  const visibleTabs = [{ id: SHARED_MEMO_PATH, name: copy.shared }, ...tabs.tabs.map(tab => ({ ...tab, name: memoTabName(tab.name) }))]
  useEffect(() => {
    if (initialOpen.current && !root.current?.contains(document.activeElement)) root.current?.focus({ preventScroll: true })
  }, [root])
  return <div ref={root} role="region" aria-label={uiText('메모')} tabIndex={-1} className="mew-panel-surface shared-memo flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-surface text-ink">
    <HoverTipLayer data-dock-tab-bar className="flex h-9 shrink-0 items-center border-b border-edge bg-surface-deep">
      <DockGrip group="memo" />
      <TabScrollArea className="h-full min-w-0 flex-1" viewportClassName="flex h-full items-center" role="tablist" aria-label={uiText('메모')}>
        {visibleTabs.map(tab => <div key={tab.id} role="tab" tabIndex={0} aria-selected={selected === tab.id}
          onClick={() => selectTab(tab.id)} onKeyDown={event => {
            if (event.target !== event.currentTarget) return
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectTab(tab.id) }
            const offset = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
            if (offset) {
              event.preventDefault(); event.stopPropagation()
              const next = visibleTabs[(visibleTabs.indexOf(tab) + offset + visibleTabs.length) % visibleTabs.length]!
              selectTab(next.id)
              const siblings = event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role=tab]')
              siblings?.[visibleTabs.indexOf(next)]?.focus({ preventScroll: true })
            }
          }}
          className={`group flex h-full shrink-0 cursor-pointer items-center gap-1.5 border-r border-edge px-2.5 text-xs select-none ${selected === tab.id ? 'bg-surface-raised text-ink' : 'text-ink-secondary hover:bg-surface-raised'}`}>
          <Notes width={14} height={14} aria-hidden="true" /><span className="max-w-[9rem] truncate">{tab.name}</span>
          {selected === tab.id && <PresenceDots colors={colors} />}
          {selected === tab.id && activated && !collab?.connected && <span role="status" aria-label={uiText('불러오는 중…')} className="inline-flex text-ink-muted"><LoadingIndicator size={12} /></span>}
          {tab.id !== SHARED_MEMO_PATH && <button type="button" disabled={tabs.busy} aria-label={copy.remove} data-tip={copy.remove}
            onClick={event => { event.stopPropagation(); setDeleteTarget(tab.id) }}
            onDoubleClick={event => event.stopPropagation()}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-ink-muted hover:bg-surface-hover hover:text-ink disabled:opacity-50">×</button>}
        </div>)}
        <button type="button" aria-label={copy.add} data-tip={copy.add} disabled={!tabs.loaded || tabs.busy}
          onClick={() => { void tabs.add().then(tab => { if (tab) selectTab(tab.id) }) }}
          onDoubleClick={event => event.stopPropagation()}
          className="flex h-full w-9 shrink-0 items-center justify-center border-r border-edge text-ink-secondary hover:bg-surface-raised hover:text-ink disabled:opacity-50">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </TabScrollArea>
      <div className="flex shrink-0 overflow-hidden rounded border border-edge-strong">
        {(['hotview', 'plain'] as const).map(mode => <button key={mode} type="button"
          onClick={() => setViewMode(mode)} aria-pressed={viewMode === mode}
          aria-label={mode === 'hotview' ? 'Hotview' : 'Plain'} data-tip={mode === 'hotview' ? 'Hotview' : 'Plain'}
          className={`p-1.5 ${viewMode === mode ? 'bg-accent text-ink-on-accent' : 'bg-surface-raised text-ink-secondary hover:bg-surface-hover'}`}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {mode === 'hotview' ? <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></> : <><path d="m18 16 4-4-4-4" /><path d="m6 8-4 4 4 4" /><path d="m14.5 4-5 16" /></>}
          </svg>
        </button>)}
      </div>
      <ToolPresentationToggle tool="memo" />
      <PanelCloseButton onClick={close} aria-label={uiText('닫기')} />
    </HoverTipLayer>
    {tabs.error && <div role="alert" className="flex shrink-0 items-center gap-2 px-2 py-1 text-xs text-danger">
      <span className="min-w-0 flex-1 break-words">{tabs.error}</span>
      <button type="button" onClick={() => { void tabs.refresh() }} className="shrink-0 rounded px-1 hover:bg-surface-hover">{uiText('다시 시도')}</button>
    </div>}
    {deleteTarget && <ConfirmDialog message={copy.confirm} detail={copy.detail} confirmLabel={uiText('삭제')} danger
      onCancel={() => setDeleteTarget(null)} onConfirm={() => { void tabs.remove(deleteTarget); setDeleteTarget(null) }} />}
    <DockInlineBody group="memo" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {Object.entries(documents).map(([id, document]) => <div key={id} data-memo-document={id} hidden={id !== selected} className="min-h-0 flex-1">
        <MemoBody id={id} collab={id === selected ? collab ?? document.collab : document.collab}
          value={id === selected ? value : document.value} onChange={id === selected ? setValue : value => setDocumentValue(id, value)}
          viewMode={id === selected ? viewMode : 'hotview'} showMobileKeyBar={id === selected && viewMode === 'hotview' && open && keyboardOpen} />
      </div>)}
    </DockInlineBody>
  </div>
}
