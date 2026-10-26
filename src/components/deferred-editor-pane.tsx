import { useEffect, useState } from 'react'
import { uiText } from '@mew/ui/i18n-core'
import type { EditorPaneProps } from './EditorPane'
import { PanelLoading } from './startup-screen'

type EditorComponent = typeof import('./EditorPane')['EditorPane']
type PreparedEditor = { scope: string; Component: EditorComponent } | { scope: string; failed: true }

type Props = EditorPaneProps & { accessVersion: string }

export function DeferredEditorPane({ accessVersion, ...props }: Props) {
  const scope = JSON.stringify([props.authEmail, props.role, props.workspace?.path, props.isGuest, props.canCollaborate, accessVersion])
  const [prepared, setPrepared] = useState<PreparedEditor | null>(null)

  useEffect(() => {
    let active = true
    void import('./EditorPane').then(module => {
      if (active) setPrepared({ scope, Component: module.EditorPane })
    }, () => {
      if (active) setPrepared({ scope, failed: true })
    })
    return () => { active = false }
  }, [scope])

  if (prepared?.scope !== scope) return <PanelLoading />
  if ('failed' in prepared) return <div role="alert" className="mew-panel-surface flex h-full min-h-0 flex-1 items-center justify-center px-4 text-center text-sm text-ink">{uiText('작업 화면을 불러오지 못했습니다. 페이지를 다시 열어 주세요.')}</div>
  return <prepared.Component {...props} />
}
