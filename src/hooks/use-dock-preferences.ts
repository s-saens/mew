import { scopedBrowserStorage } from '@mew/ui/browser-storage-scope'
import { useSyncExternalStore } from 'react'
import { writeBrowserStorage } from '@mew/ui/browser-storage'
import { DOCK_POSITIONS_KEY, MOBILE_DOCK_HIDDEN_KEY, MOBILE_DOCK_ORDER_KEY, normalizeDockPositions, normalizeHiddenDockPanels, normalizeMobileDockOrder, type DockDevice, type DockPosition, type MobileDockPanel } from '../utils/mobile-dock'

const listeners = new Set<() => void>()
function read(key: string): unknown {
  try { return JSON.parse(scopedBrowserStorage().getItem(key) ?? 'null') }
  catch { return null }
}
const readPreferences = () => ({ order: normalizeMobileDockOrder(read(MOBILE_DOCK_ORDER_KEY)), hidden: normalizeHiddenDockPanels(read(MOBILE_DOCK_HIDDEN_KEY)), positions: normalizeDockPositions(read(DOCK_POSITIONS_KEY)) })
let value = readPreferences()
const notify = () => listeners.forEach(listener => listener())
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key !== null && event.key !== MOBILE_DOCK_ORDER_KEY && event.key !== MOBILE_DOCK_HIDDEN_KEY && event.key !== DOCK_POSITIONS_KEY) return
  value = readPreferences()
  notify()
})
export function setDockOrder(order: readonly MobileDockPanel[]) {
  value = { ...value, order: normalizeMobileDockOrder(order) }
  writeBrowserStorage(MOBILE_DOCK_ORDER_KEY, JSON.stringify(value.order))
  notify()
}
export function setDockPanelVisible(panel: MobileDockPanel, visible: boolean) {
  value = { ...value, hidden: normalizeHiddenDockPanels(visible ? value.hidden.filter(id => id !== panel) : [...value.hidden, panel]) }
  writeBrowserStorage(MOBILE_DOCK_HIDDEN_KEY, JSON.stringify(value.hidden))
  notify()
}
export function resetDockPreferences() {
  value = { order: normalizeMobileDockOrder(null), hidden: [], positions: normalizeDockPositions(null) }
  writeBrowserStorage(MOBILE_DOCK_ORDER_KEY, JSON.stringify(value.order))
  writeBrowserStorage(MOBILE_DOCK_HIDDEN_KEY, JSON.stringify(value.hidden))
  writeBrowserStorage(DOCK_POSITIONS_KEY, JSON.stringify(value.positions))
  notify()
}
export function setDockPosition(device: DockDevice, position: DockPosition) {
  value = { ...value, positions: normalizeDockPositions({ ...value.positions, [device]: position }) }
  writeBrowserStorage(DOCK_POSITIONS_KEY, JSON.stringify(value.positions))
  notify()
}
export function useDockPreferences() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => value)
}
