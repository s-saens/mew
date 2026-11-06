import { exec, withTransaction, type Exec } from './pool.ts'
import { ensureCatalog } from './schema.ts'
import { quoteIdent } from './identifiers.ts'
import { documentDatabaseReferences } from './documentReferenceParser.ts'
import type { DatabaseRow } from './catalog.ts'
import { remapPagePath, type DocumentPageMove } from '../../shared/document-pages.ts'

export interface DatabaseReference {
  project: string
  path: string
  line: number
}

export interface ReferenceDocument {
  path: string
  content: string | null
  previous?: string
}

interface StoredReference extends DatabaseReference {
  database_id: string
  occurrence: number
}

export async function listDatabaseReferences(project: string): Promise<Map<string, DatabaseReference[]>> {
  const { rows } = await exec<StoredReference>(`SELECT r.database_id, r.project, r.path, r.line, r.occurrence
    FROM mew.database_references r JOIN mew.databases d ON d.id = r.database_id
    WHERE d.project = $1 ORDER BY r.path, r.line, r.occurrence`, [project])
  const result = new Map<string, DatabaseReference[]>()
  for (const row of rows) {
    const items = result.get(row.database_id) ?? []
    items.push({ project: row.project, path: row.path, line: row.line })
    result.set(row.database_id, items)
  }
  return result
}

export async function syncDatabaseReferences(project: string, documents: ReferenceDocument[]): Promise<void> {
  if (!documents.length) return
  await ensureCatalog()
  await withTransaction(tx => reconcileDatabaseReferences(tx, project, documents))
}

/** The caller owns the transaction; registering the entire batch precedes orphan cleanup. */
export async function reconcileDatabaseReferences(q: Exec, project: string, documents: ReferenceDocument[]): Promise<void> {
  // Serialize file updates and moves in a project, then lock DBs in a stable order.
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`database-references:${project}`])
  const unique = [...new Map(documents.map(document => [document.path, document])).values()]
  const paths = unique.map(document => document.path)
  const stored = await q<StoredReference>('SELECT database_id, project, path, line, occurrence FROM mew.database_references WHERE project = $1 AND path = ANY($2::text[])', [project, paths])
  const removedCandidates = new Set(stored.rows.map(row => row.database_id))
  for (const document of unique) {
    for (const reference of documentDatabaseReferences(document.previous ?? '')) removedCandidates.add(reference.databaseId)
  }
  const next = unique.flatMap(document => documentDatabaseReferences(document.content ?? '').map(reference => ({ ...reference, path: document.path })))
  const ids = [...new Set([...removedCandidates, ...next.map(reference => reference.databaseId)])].sort()
  if (!ids.length) return
  const databases = await q<DatabaseRow>('SELECT * FROM mew.databases WHERE project = $1 AND id = ANY($2::uuid[]) ORDER BY id FOR UPDATE', [project, ids])
  const available = new Set(databases.rows.map(db => db.id))
  await q('DELETE FROM mew.database_references WHERE project = $1 AND path = ANY($2::text[])', [project, paths])
  for (const reference of next) {
    if (!available.has(reference.databaseId)) continue
    await q(`INSERT INTO mew.database_references (database_id, project, path, line, occurrence)
      VALUES ($1, $2, $3, $4, $5)`, [reference.databaseId, project, reference.path, reference.line, reference.occurrence])
  }
  for (const db of databases.rows) {
    if (!removedCandidates.has(db.id)) continue
    const remaining = await q('SELECT 1 FROM mew.database_references WHERE database_id = $1 LIMIT 1', [db.id])
    if (remaining.rows.length) continue
    if (db.kind === 'managed') await q(`DROP TABLE IF EXISTS ${quoteIdent(db.phys_schema)}.${quoteIdent(db.phys_table)}`)
    await q('DELETE FROM mew.databases WHERE project = $1 AND id = $2', [project, db.id])
  }
}

export async function remapDatabaseReferences(project: string, moves: DocumentPageMove[]): Promise<void> {
  if (!moves.length) return
  await ensureCatalog()
  await withTransaction(async q => {
    await q('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`database-references:${project}`])
    const { rows } = await q<StoredReference>('SELECT database_id, project, path, line, occurrence FROM mew.database_references WHERE project = $1 FOR UPDATE', [project])
    const changed = rows.filter(row => remapPagePath(row.path, moves) !== row.path)
    // Remove the old keys first so swaps and folder moves cannot collide midway.
    for (const row of changed) await q('DELETE FROM mew.database_references WHERE database_id = $1 AND project = $2 AND path = $3 AND occurrence = $4', [row.database_id, project, row.path, row.occurrence])
    for (const row of changed) await q(`INSERT INTO mew.database_references (database_id, project, path, line, occurrence)
      VALUES ($1, $2, $3, $4, $5) ON CONFLICT (database_id, project, path, occurrence) DO UPDATE SET line = EXCLUDED.line`,
    [row.database_id, project, remapPagePath(row.path, moves), row.line, row.occurrence])
  })
}
