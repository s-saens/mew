import test from 'node:test'
import assert from 'node:assert/strict'
import { documentDatabaseReferences } from './documentReferenceParser.ts'
import { reconcileDatabaseReferences } from './documentReferences.ts'
import type { Exec } from './pool.ts'

const id = 'a1111111-1111-4111-8111-111111111111'
const other = 'b2222222-2222-4222-8222-222222222222'
const block = (database = id) => `<div data-mew-db="${database}"></div>`

test('reference locations use source lines, retain repeated occurrences, and ignore examples', () => {
  const content = [
    '---', `example: '${block()}'`, '---', '',
    block(), '', '```html', block(), '```', '',
    `    ${block()}`, '', `<!-- ${block()} -->`, '',
    `<pre>${block()}</pre>`, '', `text \`${block()}\``, '',
    `${block()}${block(other)}`, '', `> ${block()}`, '',
    `<div\n data-mew-db='${id.toUpperCase()}' data-mew-db-readonly="true"></div>`,
  ].join('\r\n')
  assert.deepEqual(documentDatabaseReferences(content), [
    { databaseId: id, line: 5, occurrence: 0 },
    { databaseId: id, line: 19, occurrence: 1 },
    { databaseId: other, line: 19, occurrence: 0 },
    { databaseId: id, line: 21, occurrence: 2 },
    { databaseId: id, line: 23, occurrence: 3 },
  ])
  assert.deepEqual(documentDatabaseReferences(`<span data-mew-db="${id}"></span>\n\n<div data-mew-db="invalid"></div>\n\n<div data-mew-db="${id}">`), [])
})

interface Reference { database_id: string; project: string; path: string; line: number; occurrence: number }
interface Database { id: string; project: string; kind: string; phys_schema: string; phys_table: string }

function memoryCatalog() {
  const databases: Database[] = [
    { id, project: 'docs', kind: 'managed', phys_schema: 'mew_docs', phys_table: 'db_first' },
    { id: other, project: 'elsewhere', kind: 'managed', phys_schema: 'mew_elsewhere', phys_table: 'db_other' },
  ]
  let references: Reference[] = []
  const drops: string[] = []
  const q = (async (sql: string, values: unknown[] = []) => {
    let rows: unknown[] = []
    if (sql.startsWith('SELECT pg_advisory')) return { rows: [] }
    if (sql.startsWith('SELECT database_id')) rows = references.filter(ref => ref.project === values[0] && (values[1] as string[]).includes(ref.path))
    else if (sql.startsWith('SELECT * FROM mew.databases')) rows = databases.filter(db => db.project === values[0] && (values[1] as string[]).includes(db.id))
    else if (sql.startsWith('DELETE FROM mew.database_references')) references = references.filter(ref => ref.project !== values[0] || !(values[1] as string[]).includes(ref.path))
    else if (sql.startsWith('INSERT INTO mew.database_references')) references.push({ database_id: values[0] as string, project: values[1] as string, path: values[2] as string, line: values[3] as number, occurrence: values[4] as number })
    else if (sql.startsWith('SELECT 1 FROM mew.database_references')) rows = references.filter(ref => ref.database_id === values[0]).slice(0, 1)
    else if (sql.startsWith('DROP TABLE')) drops.push(sql)
    else if (sql.startsWith('DELETE FROM mew.databases')) {
      const index = databases.findIndex(db => db.project === values[0] && db.id === values[1])
      if (index >= 0) databases.splice(index, 1)
    } else throw new Error(`Unexpected statement: ${sql}`)
    return { rows }
  }) as Exec
  return { q, databases, drops, references: () => references }
}

test('saved documents maintain multiple references, line changes and last-reference deletion', async () => {
  const catalog = memoryCatalog()
  const sync = (path: string, content: string | null, previous?: string) => reconcileDatabaseReferences(catalog.q, 'docs', [{ path, content, previous }])
  await sync('one.md', `${block()}\n\n${block()}`)
  await sync('two.md', `Heading\n\n${block()}`)
  assert.deepEqual(catalog.references().map(ref => [ref.path, ref.line]), [['one.md', 1], ['one.md', 3], ['two.md', 3]])
  await sync('one.md', `Heading\n\n${block()}`)
  assert.deepEqual(catalog.references().map(ref => [ref.path, ref.line]), [['two.md', 3], ['one.md', 3]])
  await sync('one.md', '')
  assert.equal(catalog.databases.some(db => db.id === id), true)
  await sync('two.md', null)
  assert.equal(catalog.databases.some(db => db.id === id), false)
  assert.equal(catalog.drops.length, 1)
  assert.deepEqual(catalog.references(), [])
  // Repeated deletion and stale references to a deleted DB remain harmless.
  await sync('two.md', null, block())
  await sync('stale.md', block())
  assert.equal(catalog.drops.length, 1)
})

test('legacy removals tolerate absent metadata; other projects and external sources remain safe', async () => {
  const catalog = memoryCatalog()
  await reconcileDatabaseReferences(catalog.q, 'docs', [{ path: 'bad.md', content: block(other) }])
  assert.deepEqual(catalog.references(), [])
  await reconcileDatabaseReferences(catalog.q, 'docs', [{ path: 'legacy.md', content: '', previous: block() }])
  assert.deepEqual(catalog.databases.map(db => db.id), [other])
  assert.equal(catalog.drops.length, 1)
  catalog.databases.push({ id, project: 'docs', kind: 'external', phys_schema: 'public', phys_table: 'source' })
  await reconcileDatabaseReferences(catalog.q, 'docs', [{ path: 'external.md', content: block() }])
  await reconcileDatabaseReferences(catalog.q, 'docs', [{ path: 'external.md', content: '' }])
  assert.equal(catalog.drops.length, 1, 'external source tables must never be dropped')
  assert.deepEqual(catalog.databases.map(db => db.id), [other])
})

test('a batch registers copied or moved references before removing the old last reference', async () => {
  const catalog = memoryCatalog()
  await reconcileDatabaseReferences(catalog.q, 'docs', [{ path: 'old.md', content: block() }])
  await reconcileDatabaseReferences(catalog.q, 'docs', [
    { path: 'old.md', content: null }, { path: 'new.md', content: `\n${block()}` },
  ])
  assert.equal(catalog.drops.length, 0)
  assert.deepEqual(catalog.references().map(ref => [ref.path, ref.line]), [['new.md', 2]])
})
