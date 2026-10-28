import { lazy, Suspense, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { EditPencil, Folder, Plus, Trash, Xmark } from 'iconoir-react'
import { ActionMenu, ActionMenuItem, ActionMenuSeparator, DialogFrame, MenuReorderHandle, useDragReorder } from '@mew/ui'
import { projectTabIndex } from '@mew/shortcuts'
import { useI18n } from '../i18n'
import { ProjectIcon } from './ProjectIcon'
import { CommandButtonMenu } from './CommandButtonMenu'
import { PanelCloseButton } from './panel-close-button'
import { WORKSPACE_PROJECT } from '../utils/active-project'

const IconPicker = lazy(() => import('./IconPicker').then(module => ({ default: module.IconPicker })))

function labelOf(projectPath: string): string {
  const parts = projectPath.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts.at(-1) || projectPath
}

export function ProjectSwitcher({ paths, activePath, fallbackLabel, canOpen, canChangeIcon, icons, onActivate, onIconChange, onOpen, onPreview, onRemove, onReorder,
  sidebarHost, sidebarEnabled = false, sidebarOpen = false, onSidebarOpenChange, sidebarWidth = 240, onSidebarResize, onSidebarWidthChange, canUseCommands = false, activeWorkingPath }: {
  paths: string[]
  activePath: string | null
  fallbackLabel: string
  canOpen: boolean
  canChangeIcon: boolean
  icons: Record<string, string>
  onActivate: (path: string) => void
  onIconChange: (path: string, icon: string) => void
  onOpen: () => void
  onPreview?: (path: string) => void
  onRemove?: (path: string) => void
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
}) {
  const { t } = useI18n()
  const trigger = useRef<HTMLButtonElement>(null)
  const menuElement = useRef<HTMLDivElement>(null)
  const sidebarList = useRef<HTMLDivElement>(null)
  const contextMenuElement = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ path: string; x: number; y: number; trigger: HTMLElement | null } | null>(null)
  const [editingPath, setEditingPath] = useState<string | null>(null)
  const iconTitleId = useId()
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null)
  const suppressClickUntil = useRef(0)
  const label = activePath ? labelOf(activePath) : fallbackLabel
  const showingSidebar = sidebarEnabled && sidebarOpen && canOpen
  const panelId = useId()
  const labels = useMemo(() => {
    const counts = new Map<string, number>()
    for (const path of paths) counts.set(labelOf(path), (counts.get(labelOf(path)) ?? 0) + 1)
    return counts
  }, [paths])

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
    setContextMenu({ path, x, y, trigger: origin })
  }
  function focusSidebar() {
    const first = sidebarList.current?.querySelector<HTMLButtonElement>('[data-project-option]')
    if (first?.checkVisibility({ visibilityProperty: true })) first.focus({ preventScroll: true })
    else requestAnimationFrame(() => sidebarList.current?.querySelector<HTMLButtonElement>('[data-project-option]')?.focus({ preventScroll: true }))
  }
  function openMenu(openOnly = false) {
    if (!canOpen || !trigger.current) return
    if (sidebarEnabled) {
      const open = openOnly || !sidebarOpen || !sidebarList.current?.checkVisibility({ visibilityProperty: true })
      onSidebarOpenChange?.(open)
      if (open) focusSidebar()
      return
    }
    const box = trigger.current.getBoundingClientRect()
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
      const target = event.target instanceof Element ? event.target : document.activeElement
      if (event.repeat || target?.closest('[role="dialog"], [aria-modal="true"]')) return
      if (chooseMenu) {
        if (sidebarEnabled) {
          onSidebarOpenChange?.(true)
          focusSidebar()
          return
        }
        const box = trigger.current?.getBoundingClientRect()
        if (box) setMenu({ x: box.left, y: box.bottom + 4 })
        menuElement.current?.querySelector<HTMLButtonElement>('[data-action-menu-item]:not(:disabled)')?.focus({ preventScroll: true })
        return
      }
      if (index === null) return
      const path = paths[index]
      if (path && path !== activePath) { setMenu(null); onActivate(path) }
    }
    window.addEventListener('keydown', select, true)
    return () => window.removeEventListener('keydown', select, true)
  }, [paths, activePath, canOpen, onActivate, sidebarEnabled, sidebarOpen, onSidebarOpenChange])

  useLayoutEffect(() => {
    if (showingSidebar) sidebarList.current?.querySelector<HTMLButtonElement>('[data-project-option]')?.focus({ preventScroll: true })
  }, [showingSidebar, sidebarHost])

  useEffect(() => { setMenu(null); setContextMenu(null) }, [sidebarEnabled])

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

  function projectItems(inSidebar: boolean) {
    return <ProjectOrder paths={paths} activePath={activePath} onReorder={onReorder} renderItem={(path, move, index) => <>
      <ActionMenuItem style={{ flex: 1, minWidth: 0, width: 'auto' }} data-project-option={path} title={path} aria-keyshortcuts={index < 9 ? `Alt+${index + 1}` : undefined} role="menuitemradio" checked={path === activePath} closeOnSelect={!inSidebar}
        icon={<span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true"><ProjectIcon icon={icons[path] ?? 'i:folder'} size={16} /></span>}
        hint={index < 9 && <kbd className="whitespace-nowrap font-sans text-[11px]">Alt+{index + 1}</kbd>}
        onPointerEnter={() => { if (path !== activePath) onPreview?.(path) }} onFocus={() => { if (path !== activePath) onPreview?.(path) }}
        onClick={() => { if (path !== activePath) onActivate(path) }}
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
        aria-label={canOpen ? `${label} — ${t('project.choose')}` : label} aria-haspopup={canOpen && !sidebarEnabled ? 'menu' : undefined} aria-expanded={canOpen ? sidebarEnabled ? showingSidebar : !!menu : undefined}
        aria-controls={sidebarEnabled && showingSidebar ? panelId : undefined}
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
    {showingSidebar && sidebarHost && createPortal(<aside id={panelId} data-project-sidebar data-workspace-panel="projects" aria-label={t('project.sidebar')}
      className="mew-project-sidebar" style={{ width: sidebarWidth }}>
      <div className="mew-project-sidebar-body">
        <div className="mew-project-sidebar-heading">
          <Folder width={14} height={14} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{t('project.sidebar')}</span>
          <PanelCloseButton aria-label={`${t('project.sidebar')} · ${t('common.close')}`} onClick={() => { onSidebarOpenChange?.(false); trigger.current?.focus({ preventScroll: true }) }} />
        </div>
        <div ref={sidebarList} role="menu" aria-label={t('project.choose')} className="mew-project-sidebar-list"
          onKeyDown={event => {
            if (event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
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
          {projectItems(true)}
        </div>
        <div className="mew-project-sidebar-footer"><ActionMenuItem icon={<Plus />} onClick={onOpen}>{t('project.add')}</ActionMenuItem></div>
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
    {canOpen && !sidebarEnabled && menu && <ActionMenu ref={menuElement} variant="header" x={menu.x} y={menu.y} label={t('project.choose')} trigger={trigger.current} outsideIgnore={() => contextMenuElement.current} onClose={() => { setContextMenu(null); setMenu(null) }}>
      {projectItems(false)}
      {paths.length > 0 && <ActionMenuSeparator />}
      <ActionMenuItem icon={<Plus />} onClick={onOpen}>{t('project.add')}</ActionMenuItem>
    </ActionMenu>}
    {contextMenu && canChangeIcon && <ActionMenu key="project-actions" x={contextMenu.x} y={contextMenu.y} label={labelOf(contextMenu.path)} ref={contextMenuElement} trigger={contextMenu.trigger} onClose={() => setContextMenu(null)}>
      <ActionMenuItem icon={<EditPencil />} onClick={() => editIcon(contextMenu.path)}>{t('project.edit')}</ActionMenuItem>
      {canOpen && onRemove && <ActionMenuItem icon={<Trash />} danger disabled={contextMenu.path === activePath && !paths.some(path => path !== activePath)} onClick={() => onRemove(contextMenu.path)}>{t('common.delete')}</ActionMenuItem>}
    </ActionMenu>}
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

function ProjectOrder({ paths, activePath, onReorder, renderItem }: {
  paths: string[]
  activePath: string | null
  onReorder?: (paths: string[]) => void
  renderItem: (path: string, move: (direction: number) => void, index: number) => React.ReactNode
}) {
  const { t } = useI18n()
  function reorder(from: number, to: number) {
    if (!onReorder || from === to || to < 0 || to >= paths.length) return
    const next = [...paths]
    next.splice(to, 0, next.splice(from, 1)[0])
    onReorder(next)
  }
  const drag = useDragReorder({ axis: 'y', handleOnly: true, onReorder: reorder })
  return paths.map((path, index) => {
    const { ref, ...handleProps } = drag.getItemProps(index)
    return <div key={path} ref={ref} role="none" data-project-row={path} data-active={path === activePath || undefined} className={`mew-sortable-menu-row ${drag.dragIndex === index ? 'opacity-60' : ''}`}>
      {onReorder && paths.length > 1 && <MenuReorderHandle {...handleProps}
        data-project-drag-handle={path} aria-label={`${labelOf(path)} · ${t('project.reorder')}`} data-tip={t('project.reorder')}
        onClick={event => { event.stopPropagation(); drag.consumeClick() }}
        onMove={direction => reorder(index, index + direction)} />}
      {renderItem(path, direction => reorder(index, index + direction), index)}
    </div>
  })
}
