import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { uiText } from '@mew/ui/i18n-core'
import type { EditorPaneProps } from './EditorPane'
import { PanelLoading } from './startup-screen'
import { prepareEditorView } from './deferred-editor-views'
import { activePaneTab } from '../utils/editor-tab-navigation'
import { editorFile } from '../utils/editor-files'
import { canOpenEditorFile } from '../utils/editor-open-policy'
import { gitDiffTarget } from '../utils/git-diff-tabs'
import { isExternalTabPath } from '../utils/externalFiles'
import { mediaKind } from '../utils/media'
import { useCollab, type Collab } from '../hooks/useCollab'
import { primaryCollabPath } from '../utils/editor-collaboration'
import { markFileOpen, type FileOpenTrace } from '../utils/fileOpenPerformance'

type EditorComponent = typeof import('./EditorPane')['EditorPane']
type PreparedEditor = { scope: string; Component: EditorComponent } | { scope: string; failed: true }
let editorModule: Promise<EditorComponent> | undefined
let editorComponent: EditorComponent | undefined

/** Prepare public pane code before dock registration; mounting still checks its scope. */
export function prepareEditorPane(): Promise<EditorComponent> {
  return editorModule ??= import('./EditorPane').then(module => editorComponent = module.EditorPane, error => { editorModule = undefined; throw error })
}

type Props = EditorPaneProps & { accessVersion: string; visible?: boolean }

function CollaborationPreparation({ scope, project, path, authEmail, trace, onPrepared }: {
  scope: string
  project: string
  path: string
  authEmail: string | null
  trace?: FileOpenTrace
  onPrepared: (scope: string, session: Collab | null) => void
}) {
  const session = useCollab(project, path, authEmail)
  const ydoc = session?.ydoc, awareness = session?.awareness, synced = session?.synced, connected = session?.connected
  useEffect(() => { markFileOpen(trace, 'collaboration-start') }, [trace])
  useEffect(() => { if (synced) markFileOpen(trace, 'collaboration-synced') }, [trace, synced])
  useLayoutEffect(() => {
    onPrepared(scope, ydoc && awareness ? { ydoc, awareness, synced: !!synced, connected: !!connected } : null)
  }, [scope, ydoc, awareness, synced, connected, onPrepared])
  useLayoutEffect(() => () => onPrepared(scope, null), [scope, onPrepared])
  return null
}

export function DeferredEditorPane({ accessVersion, visible = true, ...props }: Props) {
  const scope = JSON.stringify([props.authEmail, props.role, props.workspace?.path, props.project, props.isGuest, props.canCollaborate, accessVersion])
  const [prepared, setPrepared] = useState<PreparedEditor | null>(() => editorComponent ? { scope, Component: editorComponent } : null)
  const [collaboration, setCollaboration] = useState<{ scope: string; session: Collab | null } | null>(null)
  const receiveCollaboration = useCallback((scope: string, session: Collab | null) => setCollaboration({ scope, session }), [])
  const tab = activePaneTab(props.pane)
  const file = editorFile(props.pane.activePath ?? '', props.project), path = file.path
  const collabPath = props.canCollaborate !== false && !props.isGuest && !gitDiffTarget(props.pane.activePath ?? '')
    ? primaryCollabPath(tab ? { ...tab, path } : null, props.role, file.project, true) : null
  const collaborationScope = JSON.stringify([scope, file.project, collabPath])
  const engine = visible && tab && !tab.deferredLoad && canOpenEditorFile(path) && !gitDiffTarget(props.pane.activePath ?? '')
    && !mediaKind(path) && !(path.endsWith('.svg') && !isExternalTabPath(path) && tab.viewMode === 'hotview')
    && !(tab.status === 'error' && !tab.editable) ? tab.viewMode : null

  useLayoutEffect(() => {
    if (engine) void prepareEditorView(engine, path).catch(() => {})
  }, [scope, engine, path])

  useLayoutEffect(() => {
    if (!visible) return
    let active = true
    void prepareEditorPane().then(Component => {
      if (active) setPrepared(previous => previous?.scope === scope && 'Component' in previous && previous.Component === Component ? previous : { scope, Component })
    }, () => {
      if (active) setPrepared({ scope, failed: true })
    })
    return () => { active = false }
  }, [scope, visible])

  const current = prepared?.scope === scope ? prepared : null
  const pane = !current ? visible ? <PanelLoading /> : null
    : 'failed' in current ? <div role="alert" className="mew-panel-surface flex h-full min-h-0 flex-1 items-center justify-center px-4 text-center text-sm text-ink">{uiText('작업 화면을 불러오지 못했습니다. 페이지를 다시 열어 주세요.')}</div>
      : <current.Component {...props} preparedCollaboration={{ project: file.project, path: collabPath, authEmail: props.authEmail, session: collaboration?.scope === collaborationScope ? collaboration.session : null }} />
  return <>
    {(visible || current !== null) && !(current && 'failed' in current) && collabPath && <CollaborationPreparation key={collaborationScope} scope={collaborationScope} project={file.project} path={collabPath} authEmail={props.authEmail} trace={tab?.openTrace} onPrepared={receiveCollaboration} />}
    {pane}
  </>
}
