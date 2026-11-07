import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { PRIVATE_MEMO_PROJECT, isPrivateMemoId, privateMemoOwner, privateMemoPath, type MemoTab } from '../shared/shared-memo.ts'
import { DATA_DIR, readJsonFile, writeFileAtomic } from './dataDir.ts'
import { protectDirectory } from './platform/storage.ts'
import { createSharedMemoDoc } from './shared-memo.ts'
import type { RoomDoc } from './roomDoc.ts'

function directory(owner: string): string {
  if (!owner || owner === '.' || owner === '..') throw new Error('Invalid memo owner')
  return path.join(DATA_DIR, 'private-memos', encodeURIComponent(owner))
}
function indexFile(owner: string): string { return path.join(directory(owner), 'tabs.json') }
function roomFile(owner: string, id: string): string { return path.join(directory(owner), `${id}.json`) }

export function readPrivateMemoTabs(owner: string): MemoTab[] {
  const saved = readJsonFile<{ version: number; tabs: MemoTab[] }>(indexFile(owner))
  if (!saved) return []
  if (saved.version !== 1 || !Array.isArray(saved.tabs) || !saved.tabs.every(tab => tab && typeof tab.id === 'string' && isPrivateMemoId(tab.id) && typeof tab.name === 'string' && tab.name.trim()) || new Set(saved.tabs.map(tab => tab.id)).size !== saved.tabs.length) throw new Error('Invalid private memo index')
  return saved.tabs.map(({ id, name }) => ({ id, name }))
}

export function privateMemoExists(owner: string, id: string): boolean {
  return isPrivateMemoId(id) && readPrivateMemoTabs(owner).some(tab => tab.id === id)
}

export function createPrivateMemoTab(owner: string): MemoTab {
  const tabs = readPrivateMemoTabs(owner)
  let number = 1
  while (tabs.some(tab => tab.name === `Memo ${number}`)) number++
  const tab = { id: randomUUID(), name: `Memo ${number}` }
  protectDirectory(directory(owner))
  const doc = createSharedMemoDoc(roomFile(owner, tab.id))
  doc.destroy()
  try { writeFileAtomic(indexFile(owner), JSON.stringify({ version: 1, tabs: [...tabs, tab] })) }
  catch (error) { fs.rmSync(roomFile(owner, tab.id), { force: true }); throw error }
  return tab
}

export function deletePrivateMemoTab(owner: string, id: string): boolean {
  const tabs = readPrivateMemoTabs(owner)
  if (!isPrivateMemoId(id) || !tabs.some(tab => tab.id === id)) return false
  // Remove authorization first. Retained/stale room handles cannot publish another write.
  writeFileAtomic(indexFile(owner), JSON.stringify({ version: 1, tabs: tabs.filter(tab => tab.id !== id) }))
  fs.rmSync(roomFile(owner, id), { force: true })
  return true
}

export function privateMemoRoom(owner: string, id: string): string {
  return `${PRIVATE_MEMO_PROJECT}:${privateMemoPath(owner, id)}`
}

export function createPrivateMemoDoc(room: string): RoomDoc {
  const owner = privateMemoOwner(room), id = room.slice(room.lastIndexOf('/') + 1)
  if (!owner || !privateMemoExists(owner, id)) throw new Error('Private memo unavailable')
  const doc = createSharedMemoDoc(roomFile(owner, id))
  return {
    stateVector: () => doc.stateVector(),
    encodeStateAsUpdate: vector => doc.encodeStateAsUpdate(vector),
    applyUpdate(update) {
      if (!privateMemoExists(owner, id)) throw new Error('Private memo deleted')
      return doc.applyUpdate(update)
    },
    destroy: () => doc.destroy(),
  }
}
