import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Folder } from 'iconoir-react'
import { ActionMenuItem } from '@mew/ui'
import { projectTabIndex } from '@mew/shortcuts'
import { useI18n } from '../i18n'
import { projectHierarchy } from '../utils/project-hierarchy'
import { deferredComponent } from './deferred-component'
import { DeferredProjectCatalogPanel as ProjectCatalogPanel } from './deferred-project-catalog'
import { PanelCloseButton } from './panel-close-button'
import { ProjectIcon } from './ProjectIcon'
import { projectPanelCopy } from './project-panel-copy'
import { ProjectSelectionFrame } from './project-selection-frame'
import { ScopeToggle } from './scope-toggle'

const ProjectAddInline = deferredComponent(async () => ({ default: (await import('./project-add-inline')).ProjectAddInline }), null)
const labelOf = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) || path

/** Select a project before mounting a workspace in a new board panel. */
export function ProjectDraftSelector({ paths, icons, basePath, canUseAgent, canManageFolders, onOpen, onClose, beforeMutation, onProjectsChanged, restoreFocus }: {
  paths: string[]
  icons: Record<string, string>
  basePath: string
  canUseAgent: boolean
  canManageFolders: boolean
  onOpen: (path: string) => Promise<boolean>
  onClose: () => void
  beforeMutation: () => Promise<unknown>
  onProjectsChanged: () => Promise<void>
  restoreFocus: () => HTMLElement | null
}) {
  const { t, locale } = useI18n()
  const copy = projectPanelCopy(locale)
  const titleId = useId()
  const anchor = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const openingRef = useRef(false)
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [scope, setScope] = useState<'my' | 'all'>('my')
  const [opening, setOpening] = useState(false)
  const [catalogBusy, setCatalogBusy] = useState(false)
  const rows = useMemo(() => projectHierarchy(paths), [paths])
  const labelCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const path of paths) counts.set(labelOf(path), (counts.get(labelOf(path)) ?? 0) + 1)
    return counts
  }, [paths])
  const busy = opening || catalogBusy

  useLayoutEffect(() => { setHost(anchor.current?.closest<HTMLElement>('[data-project-panel]') ?? null) }, [])
  useLayoutEffect(() => {
    if (host) (list.current?.querySelector<HTMLButtonElement>('[data-project-option]')
      ?? host.querySelector<HTMLButtonElement>('[data-project-scope] button[aria-pressed="true"]'))?.focus({ preventScroll: true })
  }, [host])

  async function open(path: string) {
    if (openingRef.current) return false
    openingRef.current = true
    setOpening(true)
    try { return await onOpen(path) }
    finally { openingRef.current = false; setOpening(false) }
  }

  return <><div ref={anchor} />{host && <ProjectSelectionFrame host={host} labelledBy={titleId} busy={busy} onClose={onClose} restoreFocus={restoreFocus}>
    <div data-mobile-project-panel className="mew-project-sidebar-body min-h-0" onKeyDown={event => {
      if (busy || event.defaultPrevented || event.repeat || event.nativeEvent.isComposing || !event.currentTarget.contains(event.target as Node)) return
      const index = projectTabIndex(event.nativeEvent)
      if (index === null || !rows[index]) return
      event.preventDefault(); event.stopPropagation(); void open(rows[index].path)
    }}>
      <div className="mew-project-sidebar-heading">
        <Folder width={14} height={14} aria-hidden="true" />
        <h2 id={titleId} className="min-w-0 flex-1 truncate">{copy.title}</h2>
        <PanelCloseButton disabled={busy} aria-label={`${copy.title} · ${t('common.close')}`} onClick={onClose} />
      </div>
      <div className="flex shrink-0 items-center gap-1 border-b border-edge p-1" data-project-scope>
        <ScopeToggle<'my' | 'all'> label={t('project.choose')} value={scope} disabled={busy}
          options={[{ value: 'my', label: copy.mine }, { value: 'all', label: copy.all }]} onChange={setScope} />
      </div>
      <div className="mew-project-sidebar-content">
        <div ref={list} role={scope === 'my' ? 'menu' : undefined} data-inline-menu={scope === 'my' || undefined}
          data-project-list-scope={scope} aria-label={t('project.choose')} className="mew-project-sidebar-list"
          onKeyDown={event => {
            if (scope !== 'my' || event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-action-menu-item]:not(:disabled)'))
            if (!items.length) return
            const index = items.indexOf(event.currentTarget.ownerDocument.activeElement as HTMLButtonElement)
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
              : event.key === 'ArrowDown' ? (index + 1) % items.length
              : event.key === 'ArrowUp' ? (index - 1 + items.length) % items.length : null
            if (next !== null) { event.preventDefault(); items[next]?.focus({ preventScroll: true }) }
          }}>
          {scope === 'my' ? rows.map(({ path, depth, index }) => <div key={path} role="none" data-project-row={path} data-project-depth={depth}
            style={{ paddingLeft: Math.min(depth, 5) * 12 }} className="mew-sortable-menu-row">
            <ActionMenuItem style={{ flex: 1, minWidth: 0, width: 'auto' }} data-project-option={path} title={path} disabled={busy}
              aria-keyshortcuts={index < 9 ? `Alt+${index + 1}` : undefined} role="menuitemradio" checked={false} closeOnSelect={false}
              icon={<span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true"><ProjectIcon icon={icons[path] ?? 'i:folder'} size={16} /></span>}
              hint={index < 9 && <kbd className="whitespace-nowrap font-sans text-[11px]">Alt+{index + 1}</kbd>}
              onClick={() => { void open(path) }}>
              <span className="min-w-0 flex-1 text-left"><span className="block truncate">{labelOf(path)}</span>
                {(labelCounts.get(labelOf(path)) ?? 0) > 1 && <span className="block truncate text-[10px] text-ink-muted">{path}</span>}
              </span>
            </ActionMenuItem>
          </div>) : <ProjectCatalogPanel paths={paths} beforeMutation={beforeMutation} onProjectsChanged={onProjectsChanged} onBusyChange={setCatalogBusy} onOpen={open} />}
        </div>
        <div className="mew-project-inline-add" inert={busy || undefined}>
          <ProjectAddInline basePath={basePath} paths={paths} canUseAgent={canUseAgent} canManageFolders={canManageFolders}
            onOpen={open} beforeMutation={beforeMutation} onProjectsChanged={onProjectsChanged} />
        </div>
      </div>
    </div>
  </ProjectSelectionFrame>}</>
}
