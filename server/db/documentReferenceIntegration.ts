import fs from 'node:fs'
import path from 'node:path'
import { resolveProjectPath } from '../paths.ts'
import { isTreeExcludedSegment } from '../tree.ts'
import type { DocumentPageMove, DocumentPageMutation } from '../../shared/document-pages.ts'
import { isDbConfigured, exec } from './pool.ts'
import { ensureCatalog } from './schema.ts'
import { remapDatabaseReferences, syncDatabaseReferences } from './documentReferences.ts'

type SavedDocument = { path: string; content: string | null; previous?: string }
type ReferenceAdapter = {
  configured(): boolean
  registeredPaths(project: string, prefixes: readonly string[]): Promise<string[]>
  sync(project: string, documents: SavedDocument[]): Promise<void>
  remap(project: string, moves: DocumentPageMove[]): Promise<void>
  resolve(project: string, relative: string): string
}
const hasMarker = (content: string) => /data-mew-db\s*=/i.test(content)

/** Serialize disk mutations and watcher reconciliation so a move cannot delete its last reference midway. */
export function createDocumentReferenceIntegration(adapter: ReferenceAdapter) {
  const pending = new Map<string, Promise<unknown>>()
  function normalized(project: string, relative: string): string {
    return path.relative(adapter.resolve(project, ''), adapter.resolve(project, relative)).split(path.sep).join('/')
  }
  function serialize<T>(project: string, operation: () => Promise<T>): Promise<T> {
    const previous = pending.get(project) ?? Promise.resolve()
    const task = previous.catch(() => {}).then(operation)
    pending.set(project, task)
    void task.finally(() => { if (pending.get(project) === task) pending.delete(project) }).catch(() => {})
    return task
  }
  async function optional(operation: () => Promise<void>) {
    try { await operation() } catch (error) { console.error('[mew] database reference sync:', (error as Error).message) }
  }
  function read(project: string, relatives: readonly string[]): Map<string, string> {
    const documents = new Map<string, string>()
    const visit = (relative: string) => {
      if (relative.split('/').some(isTreeExcludedSegment)) return
      const absolute = adapter.resolve(project, relative)
      let stat: fs.Stats
      try { stat = fs.lstatSync(absolute) } catch (error) {
        if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return
        throw error
      }
      if (stat.isSymbolicLink()) return
      if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(absolute)) visit(relative ? `${relative}/${entry}` : entry)
      } else if (stat.isFile() && /\.md$/i.test(relative)) documents.set(relative, fs.readFileSync(absolute, 'utf8'))
    }
    for (const relative of new Set(relatives)) {
      if (relative.split('/').some(isTreeExcludedSegment)) continue
      visit(normalized(project, relative))
    }
    return documents
  }
  async function refresh(project: string, paths: readonly string[], previous = new Map<string, string>()) {
    if (!adapter.configured() || !paths.length) return
    paths = paths.filter(relative => !relative.split('/').some(isTreeExcludedSegment)).map(relative => normalized(project, relative))
    if (!paths.length) return
    const documents = read(project, paths)
    const registered = await adapter.registeredPaths(project, paths)
    const changed = new Set([...documents.keys(), ...registered, ...previous.keys()])
    const updates: SavedDocument[] = []
    for (const relative of changed) {
      const content = documents.get(relative) ?? null, before = previous.get(relative)
      if (content === null || hasMarker(content) || hasMarker(before ?? '') || registered.includes(relative)) {
        updates.push({ path: relative, content, ...(before !== undefined ? { previous: before } : {}) })
      }
    }
    // One batch lets the service register destinations before removing source references.
    if (updates.length) await adapter.sync(project, updates)
  }
  return {
    save(project: string, relative: string, content: string, previous?: string): Promise<void> {
      if (!adapter.configured() || !/\.md$/i.test(relative) || ![content, previous ?? ''].some(hasMarker)) return Promise.resolve()
      return serialize(project, () => optional(() => adapter.sync(project, [{ path: normalized(project, relative), content, ...(previous !== undefined ? { previous } : {}) }])))
    },
    refresh(project: string, paths: readonly string[]): Promise<void> {
      if (!adapter.configured() || !paths.length) return Promise.resolve()
      return serialize(project, () => optional(() => refresh(project, paths)))
    },
    mutate(project: string, beforePaths: readonly string[], operation: () => DocumentPageMutation): Promise<DocumentPageMutation> {
      return serialize(project, async () => {
        // The filesystem operation itself keeps its ordinary error behavior. Optional DB failures do not undo saved files.
        let before = new Map<string, string>()
        if (adapter.configured()) await optional(async () => { before = read(project, beforePaths) })
        const result = operation()
        if (adapter.configured()) await optional(async () => {
          if (result.moves.length) await adapter.remap(project, result.moves.map(move => ({ ...move, from: normalized(project, move.from), to: normalized(project, move.to) })))
          await refresh(project, result.changed, before)
        })
        return result
      })
    },
  }
}

// Cache metadata paths only; ordinary Markdown edits never require a DB query after this lazy load.
const registeredByProject = new Map<string, Promise<string[]>>()
const integration = createDocumentReferenceIntegration({
  configured: isDbConfigured,
  resolve: resolveProjectPath,
  async sync(project, documents) {
    await syncDatabaseReferences(project, documents)
    registeredByProject.delete(project)
  },
  async remap(project, moves) {
    await remapDatabaseReferences(project, moves)
    registeredByProject.delete(project)
  },
  async registeredPaths(project, prefixes) {
    let registered = registeredByProject.get(project)
    if (!registered) {
      registered = (async () => {
        await ensureCatalog()
        const { rows } = await exec<{ path: string }>('SELECT DISTINCT path FROM mew.database_references WHERE project = $1', [project])
        return rows.map(row => row.path)
      })()
      registeredByProject.set(project, registered)
      void registered.catch(() => { if (registeredByProject.get(project) === registered) registeredByProject.delete(project) })
    }
    return (await registered).filter(relative => prefixes.some(prefix => !prefix || relative === prefix || relative.startsWith(`${prefix}/`)))
  },
})
export const saveDocumentDatabaseReferences = integration.save
export const refreshDocumentDatabaseReferences = integration.refresh
export const mutateDocumentDatabaseReferences = integration.mutate
