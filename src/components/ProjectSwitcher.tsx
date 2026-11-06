import { lazy, Suspense, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { EditPencil, Folder, Plus, Trash, Xmark } from 'iconoir-react'
import { ActionMenu, ActionMenuItem, ActionMenuSeparator, DialogFrame, MenuReorderHandle, useDragReorder } from '@mew/ui'
import { projectTabIndex } from '@mew/shortcuts'
import { useI18n } from '../i18n'
import { ProjectIcon } from './ProjectIcon'
import { CommandButtonMenu } from './CommandButtonMenu'
import { PanelCloseButton } from './panel-close-button'
import { ProjectCatalogPanel } from './project-catalog-panel'
import { projectPanelCopy } from './project-panel-copy'
import { projectDeleteCopy } from './project-delete-copy'
import { ProjectDeleteDialog } from './project-delete-dialog'
import { ScopeToggle } from './scope-toggle'
import { WORKSPACE_PROJECT } from '../utils/active-project'
import { projectHierarchy, type ProjectHierarchyRow } from '../utils/project-hierarchy'

const IconPicker = lazy(() => import('./IconPicker').then(module => ({ default: module.IconPicker })))

function labelOf(projectPath: string): string {
  const parts = projectPath.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts.at(-1) || projectPath
}

export function ProjectSwitcher({ paths, activePath, pendingPath, fallbackLabel, canOpen, canChangeIcon, canDelete = false, icons, onActivate, onIconChange, onOpen, onPreview, onRemove, onDelete, onReorder,
  sidebarHost, sidebarEnabled = false, sidebarOpen = false, onSidebarOpenChange, sidebarWidth = 240, onSidebarResize, onSidebarWidthChange, canUseCommands = false, activeWorkingPath, projectAdd, openRequested = false, onOpenCatalogProject, beforeProjectMutation }: {
  paths: string[]
  activePath: string | null
  pendingPath?: string | null
  fallbackLabel: string
  canOpen: boolean
  canChangeIcon: boolean
  canDelete?: boolean
  icons: Record<string, string>
  onActivate: (path: string) => void
  onIconChange: (path: string, icon: string) => void
  onOpen: () => void
  onPreview?: (path: string) => void
  onRemove?: (path: string) => void
  onDelete?: (path: string) => Promise<void>
  onReorder?: (paths: string[]) => void
  sidebarHost?: HTMLElement | null
  sidebarEnabled?: boolean
  sidebarOpen?: boolean
  onSidebarOpenChange?: (open: boolean) => void
  sidebarWidth?: number
  onSidebarResize?: (event: React.PointerEvent) => void
  onSidebarWidthChange?: (width: number) => void
  canUseCommands?: boolean
  activeWorkingPath?: string | null
  projectAdd?: React.ReactNode
  openRequested?: boolean
  onOpenCatalogProject?: (path: string) => Promise<boolean | void> | boolean | void
  beforeProjectMutation?: () => Promise<unknown>
}) {
  const { t, locale } = useI18n()
  const copy = projectPanelCopy(locale)
  const deleteCopy = projectDeleteCopy(locale)
  const [scope, setScope] = useState<'my' | 'all'>('my')
  const [catalogBusy, setCatalogBusy] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const menuElement = useRef<HTMLDivElement>(null)
  const sidebarList = useRef<HTMLDivElement>(null)
  const contextMenuElement = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [mobile, setMobile] = useState(() => window.matchMedia('(width < 768px)').matches)
  const [contextMenu, setContextMenu] = useState<{ path: string; x: number; y: number; trigger: HTMLElement | null; container: HTMLElement | null } | null>(null)
  const [editingPath, setEditingPath] = useState<string | null>(null)
  const [deleteChoices, setDeleteChoices] = useState(false)
  const [deletingPath, setDeletingPath] = useState<string | null>(null)
  const iconTitleId = useId()
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null)
  const suppressClickUntil = useRef(0)
  const label = activePath ? labelOf(activePath) : fallbackLabel
  const selectionPath = pendingPath ?? activePath
  const showingSidebar = sidebarEnabled && sidebarOpen && canOpen
  const panelId = useId()
  const mobileTitleId = useId()
  const rows = useMemo(() => projectHierarchy(paths), [paths])
  const labels = useMemo(() => {
    const counts = new Map<string, number>()
    for (const path of paths) counts.set(labelOf(path), (counts.get(labelOf(path)) ?? 0) + 1)
    return counts
  }, [paths])

  useEffect(() => {
    const query = window.matchMedia('(width < 768px)')
    const update = () => setMobile(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  function closeMenu() {
    if (catalogBusy) return
    setContextMenu(null)
    setMenu(null)
    trigger.current?.focus({ preventScroll: true })
  }

  function cancelHold() {
    if (hold.current) clearTimeout(hold.current.timer)
    hold.current = null
  }
  function editIcon(path: string) {
    cancelHold()
    setMenu(null)
    trigger.current?.focus({ preventScroll: true })
    setEditingPath(path)
  }
  function openContextMenu(path: string, x: number, y: number, origin: HTMLElement | null = trigger.current) {
    cancelHold()
    setDeleteChoices(false)
    setContextMenu({ path, x, y, trigger: origin, container: origin?.closest<HTMLElement>('[role="dialog"]') ?? null })
  }
  function focusList(list: HTMLElement | null) {
    const first = list?.querySelector<HTMLButtonElement>('[data-project-option], .mew-project-catalog-open')
      ?? list?.closest('[data-project-sidebar], [data-mobile-project-panel]')?.querySelector<HTMLButtonElement>('[data-project-scope] button[aria-pressed="true"]')
    first?.focus({ preventScroll: true })
  }
  function focusSidebar() {
    if (sidebarList.current?.checkVisibility({ visibilityProperty: true })) focusList(sidebarList.current)
    else requestAnimationFrame(() => focusList(sidebarList.current))
  }
  function openMenu(openOnly = false) {
    if (!canOpen || !trigger.current || catalogBusy) return
    if (sidebarEnabled) {
      const open = openOnly || !sidebarOpen || !sidebarList.current?.checkVisibility({ visibilityProperty: true })
      onSidebarOpenChange?.(open)
      if (open) focusSidebar()
      return
    }
    const box = trigger.current.getBoundingClientRect()
    if (mobile) trigger.current.focus({ preventScroll: true })
    setMenu({ x: box.left, y: box.bottom + 4 })
  }

  useEffect(() => {
    const select = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !canOpen) return
      const chooseMenu = event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.isComposing
        && (event.code === 'KeyP' || event.key.toLowerCase() === 'p')
      const index = projectTabIndex(event)
      if (!chooseMenu && index === null) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (catalogBusy) return
      const target = event.target instanceof Element ? event.target : document.activeElement
      if (event.repeat || (target?.closest('[role="dialog"], [aria-modal="true"]') && !target.closest('[data-mobile-project-panel]'))) return
      if (chooseMenu) {
        if (sidebarEnabled) {
          onSidebarOpenChange?.(true)
          focusSidebar()
          return
        }
        const box = trigger.current?.getBoundingClientRect()
        if (mobile && !menuElement.current) trigger.current?.focus({ preventScroll: true })
        if (box) setMenu({ x: box.left, y: box.bottom + 4 })
        if (mobile) focusList(menuElement.current)
        else menuElement.current?.querySelector<HTMLButtonElement>('[data-action-menu-item]:not(:disabled)')?.focus({ preventScroll: true })
        return
      }
      if (index === null) return
      const path = rows[index]?.path
      if (path && path !== selectionPath) { if (mobile && menuElement.current) closeMenu(); else setMenu(null); onActivate(path) }
    }
    window.addEventListener('keydown', select, true)
    return () => window.removeEventListener('keydown', select, true)
  }, [rows, selectionPath, canOpen, onActivate, sidebarEnabled, sidebarOpen, onSidebarOpenChange, mobile, catalogBusy])

  useLayoutEffect(() => {
    if (showingSidebar) focusList(sidebarList.current)
  }, [showingSidebar, sidebarHost])

  useEffect(() => {
    if (mobile && menu) focusList(menuElement.current)
  }, [mobile, menu])

  useEffect(() => { setMenu(null); setContextMenu(null) }, [sidebarEnabled])

  useEffect(() => {
    if (!openRequested || !canOpen) return
    if (sidebarEnabled) onSidebarOpenChange?.(true)
    else {
      const box = trigger.current?.getBoundingClientRect()
      if (box) setMenu({ x: box.left, y: box.bottom + 4 })
    }
  }, [openRequested, canOpen, sidebarEnabled, onSidebarOpenChange])

  useEffect(() => {
    setMenu(null)
    setContextMenu(null)
    cancelHold()
  }, [activePath, canOpen, canChangeIcon])
  useEffect(() => {
    window.addEventListener('blur', cancelHold)
    window.addEventListener('resize', cancelHold)
    document.addEventListener('visibilitychange', cancelHold)
    return () => {
      cancelHold()
      window.removeEventListener('blur', cancelHold)
      window.removeEventListener('resize', cancelHold)
      document.removeEventListener('visibilitychange', cancelHold)
    }
  }, [])

  const content = <>
    <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true"><ProjectIcon icon={activePath ? icons[activePath] ?? 'i:folder' : 'i:folder'} size={16} /></span>
    <span className="max-w-[min(18rem,50vw)] truncate">{label}</span>
  </>

  const scopeToggle = <div className="flex shrink-0 items-center gap-1 border-b border-edge p-1" data-project-scope>
    <ScopeToggle<'my' | 'all'> label={t('project.choose')} value={scope} disabled={catalogBusy}
      options={[{ value: 'my', label: copy.mine }, { value: 'all', label: copy.all }]} onChange={setScope} />
  </div>

  function catalog() {
    return <ProjectCatalogPanel paths={paths} beforeMutation={beforeProjectMutation} onBusyChange={setCatalogBusy}
      onOpen={async path => {
        try {
          const result = await (onOpenCatalogProject ? onOpenCatalogProject(path) : onActivate(path))
          if (result !== false && mobile) {
            setContextMenu(null)
            setMenu(null)
            trigger.current?.focus({ preventScroll: true })
          }
          return result
        } finally {
          setCatalogBusy(false)
        }
      }} />
  }

  function projectItems(inSidebar: boolean) {
    return <ProjectOrder rows={rows} activePath={activePath} onReorder={onReorder} renderItem={(path, move, index) => <>
      <ActionMenuItem style={{ flex: 1, minWidth: 0, width: 'auto' }} data-project-option={path} title={path} aria-keyshortcuts={index < 9 ? `Alt+${index + 1}` : undefined} role="menuitemradio" checked={path === activePath} closeOnSelect={!inSidebar}
        data-dialog-autofocus={!inSidebar && index === 0 || undefined}
        icon={<span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true"><ProjectIcon icon={icons[path] ?? 'i:folder'} size={16} /></span>}
        hint={index < 9 && <kbd className="whitespace-nowrap font-sans text-[11px]">Alt+{index + 1}</kbd>}
        onPointerEnter={() => { if (path !== activePath) onPreview?.(path) }} onFocus={() => { if (path !== activePath) onPreview?.(path) }}
        onClick={() => { if (mobile && !inSidebar) closeMenu(); if (path !== selectionPath) onActivate(path) }}
        onContextMenu={event => { if (canChangeIcon) { event.preventDefault(); openContextMenu(path, event.clientX, event.clientY, event.currentTarget) } }}
        onKeyDown={event => { if (onReorder && event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); event.stopPropagation(); move(event.key === 'ArrowUp' ? -1 : 1); return } if (canChangeIcon && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) { event.preventDefault(); const box = event.currentTarget.getBoundingClientRect(); openContextMenu(path, box.left, box.bottom, event.currentTarget) } }}>
        <span className="min-w-0 flex-1 text-left"><span className="block truncate">{labelOf(path)}</span>
          {(labels.get(labelOf(path)) ?? 0) > 1 && <span className="block truncate text-[10px] text-ink-muted">{path}</span>}
        </span>
      </ActionMenuItem>
      {inSidebar && canUseCommands && <CommandButtonMenu key={`${path}:${path === activePath ? activeWorkingPath : path}`} project={WORKSPACE_PROJECT}
        workspacePath={path === activePath ? activeWorkingPath ?? path : path} shortcutEnabled={path === activePath}
        title={`${labelOf(path)} · ${t('project.commands')}`} className="mew-project-command" />}
    </>} />
  }

  return <>
    <div data-project-switcher-container className="flex h-full min-w-0 items-stretch">
      {canOpen || canChangeIcon ? <button ref={trigger} type="button" data-project-switcher data-current-project={activePath ?? ''}
        data-header-menu-trigger={canOpen && !sidebarEnabled || undefined}
        aria-keyshortcuts={canOpen ? 'Alt+P' : undefined}
        aria-label={canOpen ? `${label} — ${t('project.choose')}` : label} aria-haspopup={canOpen && !sidebarEnabled ? mobile ? 'dialog' : 'menu' : undefined} aria-expanded={canOpen ? sidebarEnabled ? showingSidebar : !!menu : undefined}
        aria-controls={sidebarEnabled && showingSidebar ? panelId : mobile && menu ? panelId : undefined}
        title={activePath ?? label} className="flex h-full min-w-0 select-none items-center gap-1.5 px-2.5 text-xs text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        style={{ WebkitTouchCallout: 'none' }}
        onClick={() => { if (Date.now() >= suppressClickUntil.current) openMenu() }}
        onContextMenu={event => { if (canChangeIcon && activePath) { event.preventDefault(); openContextMenu(activePath, event.clientX, event.clientY) } }}
        onKeyDown={event => {
          if ((event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) && canChangeIcon && activePath) {
            event.preventDefault(); const box = event.currentTarget.getBoundingClientRect(); openContextMenu(activePath, box.left, box.bottom)
          } else if (canOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); openMenu(true) }
        }}
        onPointerDown={event => {
          cancelHold()
          if (!canChangeIcon || !activePath || event.pointerType === 'mouse' || !event.isPrimary) return
          const path = activePath
          hold.current = { x: event.clientX, y: event.clientY, timer: setTimeout(() => {
            suppressClickUntil.current = Date.now() + 1000
            const box = trigger.current?.getBoundingClientRect()
            openContextMenu(path, box?.left ?? event.clientX, (box?.bottom ?? event.clientY) + 4)
          }, 550) }
        }}
        onPointerMove={event => { if (hold.current && Math.hypot(event.clientX - hold.current.x, event.clientY - hold.current.y) > 10) cancelHold() }}
        onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerLeave={cancelHold}>
        {content}
      </button> : <div data-project-switcher data-current-project={activePath ?? ''} title={activePath ?? label} className="flex h-full min-w-0 items-center gap-1.5 px-2.5 text-xs text-ink">{content}</div>}
    </div>
    {showingSidebar && sidebarHost && createPortal(<aside id={panelId} data-project-sidebar data-workspace-panel="projects" aria-label={copy.title}
      className="mew-project-sidebar mew-panel-surface bg-surface-deep" style={{ width: sidebarWidth }}>
      <div className="mew-project-sidebar-body">
        <div className="mew-project-sidebar-heading">
          <Folder width={14} height={14} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{copy.title}</span>
          <PanelCloseButton disabled={catalogBusy} aria-label={`${copy.title} · ${t('common.close')}`} onClick={() => { onSidebarOpenChange?.(false); trigger.current?.focus({ preventScroll: true }) }} />
        </div>
        {scopeToggle}
        <div className={projectAdd ? 'mew-project-sidebar-content' : 'contents'}>
        <div ref={sidebarList} role={scope === 'my' ? 'menu' : undefined} data-inline-menu={scope === 'my' || undefined} data-project-list-scope={scope} aria-label={t('project.choose')} className="mew-project-sidebar-list"
          onKeyDown={event => {
            if (scope !== 'my' || event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
              || !event.currentTarget.contains(event.target as Node)) return
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-project-option]'))
            const row = (event.target as Element).closest('[data-project-row]')
            const index = items.findIndex(item => row?.contains(item))
            if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
              const target = event.key === 'ArrowRight' ? row?.querySelector<HTMLButtonElement>('.mew-project-command') : items[index]
              if (target) { event.preventDefault(); target.focus() }
              return
            }
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
              : event.key === 'ArrowDown' ? (index + 1) % items.length
              : event.key === 'ArrowUp' ? (index - 1 + items.length) % items.length : null
            if (next !== null) { event.preventDefault(); items[next]?.focus({ preventScroll: true }) }
          }}>
          {scope === 'my' ? projectItems(true) : catalog()}
        </div>
        {projectAdd && <div className="mew-project-inline-add" inert={catalogBusy || undefined}>{projectAdd}</div>}
        </div>
        {!projectAdd && <div className="mew-project-sidebar-footer"><ActionMenuItem icon={<Plus />} onClick={onOpen}>{t('project.add')}</ActionMenuItem></div>}
      </div>
      <div role="separator" tabIndex={0} aria-label={t('project.resizeSidebar')} aria-orientation="vertical" aria-valuenow={sidebarWidth} aria-valuemin={200} aria-valuemax={360}
        className="mew-project-sidebar-resize" onPointerDown={onSidebarResize}
        onKeyDown={event => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
            event.preventDefault()
            onSidebarWidthChange?.(event.key === 'Home' ? 200 : event.key === 'End' ? 360 : sidebarWidth + (event.key === 'ArrowRight' ? 16 : -16))
          }
        }} />
    </aside>, sidebarHost)}
    {canOpen && !sidebarEnabled && menu && (mobile ? <DialogFrame labelledBy={mobileTitleId} onClose={closeMenu} busy={catalogBusy} size="settings" className="mew-mobile-project-panel">
      <div id={panelId} data-mobile-project-panel className="mew-project-sidebar-body min-h-0">
        <div className="mew-project-sidebar-heading">
          <Folder width={14} height={14} aria-hidden="true" />
          <h2 id={mobileTitleId} className="min-w-0 flex-1 truncate">{copy.title}</h2>
          <PanelCloseButton disabled={catalogBusy} aria-label={`${copy.title} · ${t('common.close')}`} onClick={closeMenu} />
        </div>
        {scopeToggle}
        <div className={projectAdd ? 'mew-project-sidebar-content' : 'contents'}>
        <div ref={menuElement} role={scope === 'my' ? 'menu' : undefined} data-inline-menu={scope === 'my' || undefined} data-project-list-scope={scope} aria-label={t('project.choose')} className="mew-project-sidebar-list"
          onKeyDown={event => {
            if (scope !== 'my' || event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-action-menu-item]:not(:disabled)'))
            const index = items.indexOf(document.activeElement as HTMLButtonElement)
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
              : event.key === 'ArrowDown' ? (index + 1) % items.length
              : event.key === 'ArrowUp' ? (index - 1 + items.length) % items.length : null
            if (next !== null) { event.preventDefault(); items[next]?.focus({ preventScroll: true }) }
          }}>
          {scope === 'my' ? projectItems(false) : catalog()}
          {!projectAdd && <div className="mew-project-sidebar-footer"><ActionMenuItem icon={<Plus />} onClick={() => { closeMenu(); onOpen() }}>{t('project.add')}</ActionMenuItem></div>}
        </div>
        {projectAdd && <div className="mew-project-inline-add" inert={catalogBusy || undefined}>{projectAdd}</div>}
        </div>
      </div>
    </DialogFrame> : <ActionMenu ref={menuElement} variant="header" x={menu.x} y={menu.y} label={t('project.choose')} trigger={trigger.current}
      outsideIgnore={() => deletingPath ? document.body : contextMenuElement.current ?? (menuElement.current?.querySelector('[data-project-add-inline] [aria-expanded="true"]') ? document.body : null)}
      onClose={() => { setContextMenu(null); setMenu(null) }}>
      {projectItems(false)}
      {paths.length > 0 && <ActionMenuSeparator />}
      {projectAdd ?? <ActionMenuItem icon={<Plus />} onClick={onOpen}>{t('project.add')}</ActionMenuItem>}
    </ActionMenu>)}
    {contextMenu && canChangeIcon && <ActionMenu key="project-actions" x={contextMenu.x} y={contextMenu.y} label={labelOf(contextMenu.path)} ref={contextMenuElement} trigger={contextMenu.trigger}
      portalContainer={contextMenu.container} onClose={() => setContextMenu(null)}>
      {deleteChoices ? <>
        {canOpen && onRemove && <ActionMenuItem icon={<Xmark />} onClick={() => onRemove(contextMenu.path)}>{deleteCopy.removeFromMine}</ActionMenuItem>}
        {canDelete && onDelete && <ActionMenuItem icon={<Trash />} danger onClick={() => setDeletingPath(contextMenu.path)}>{deleteCopy.permanently}</ActionMenuItem>}
      </> : <>
        <ActionMenuItem icon={<EditPencil />} onClick={() => editIcon(contextMenu.path)}>{t('project.edit')}</ActionMenuItem>
        {canOpen && (onRemove || canDelete && onDelete) && <ActionMenuItem icon={<Trash />} closeOnSelect={false} onClick={() => {
          setDeleteChoices(true)
          requestAnimationFrame(() => contextMenuElement.current?.querySelector<HTMLButtonElement>('[data-action-menu-item]')?.focus({ preventScroll: true }))
        }}>{deleteCopy.remove}</ActionMenuItem>}
      </>}
    </ActionMenu>}
    {deletingPath && canDelete && onDelete && <ProjectDeleteDialog path={deletingPath} onDelete={onDelete} onClose={() => setDeletingPath(null)} />}
    {editingPath && canChangeIcon && <DialogFrame labelledBy={iconTitleId} onClose={() => setEditingPath(null)}>
      <div className="p-3">
        <div className="mb-2 flex items-center justify-between gap-2"><h2 id={iconTitleId} className="text-sm font-semibold text-ink">{t('project.icon')}</h2>
          <button type="button" onClick={() => setEditingPath(null)} className="flex h-6 w-6 items-center justify-center text-ink-secondary hover:text-ink" aria-label={t('common.close')} data-tip={t('common.close')}><Xmark width={14} height={14} aria-hidden="true" /></button></div>
        <Suspense fallback={<div role="status" aria-label={t('common.loading')} className="h-52" />}>
          <IconPicker value={icons[editingPath] ?? ''} onChange={icon => { onIconChange(editingPath, icon); setEditingPath(null) }} />
        </Suspense>
      </div>
    </DialogFrame>}
  </>
}

function ProjectOrder({ rows, activePath, onReorder, renderItem }: {
  rows: ProjectHierarchyRow[]
  activePath: string | null
  onReorder?: (paths: string[]) => void
  renderItem: (path: string, move: (direction: number) => void, index: number) => React.ReactNode
}) {
  const { t } = useI18n()
  function reorder(from: number, to: number) {
    if (!onReorder || from === to || to < 0 || to >= rows.length) return
    const next = rows.map(row => row.path)
    next.splice(to, 0, next.splice(from, 1)[0])
    onReorder(next)
  }
  const drag = useDragReorder({ axis: 'y', handleOnly: true, onReorder: reorder })
  return rows.map(({ path, depth, index }, visualIndex) => {
    const { ref, ...handleProps } = drag.getItemProps(visualIndex)
    return <div key={path} ref={ref} role="none" data-project-row={path} data-project-depth={depth} data-active={path === activePath || undefined} style={{ paddingLeft: Math.min(depth, 5) * 12 }} className={`mew-sortable-menu-row ${drag.dragIndex === visualIndex ? 'opacity-60' : ''}`}>
      {onReorder && rows.length > 1 && <MenuReorderHandle {...handleProps}
        data-project-drag-handle={path} aria-label={`${labelOf(path)} · ${t('project.reorder')}`} data-tip={t('project.reorder')}
        onClick={event => { event.stopPropagation(); drag.consumeClick() }}
        onMove={direction => reorder(index, index + direction)} />}
      {renderItem(path, direction => reorder(index, index + direction), index)}
    </div>
  })
}
