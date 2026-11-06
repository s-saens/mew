import test from 'node:test'
import assert from 'node:assert/strict'
import { createDatabase, attachExternal, listDatabases, getView, DbObjectNotFoundError } from './databaseService.ts'
import { syncDatabaseReferences, remapDatabaseReferences } from './documentReferences.ts'
import { exec, closePool } from './pool.ts'
import { quoteIdent, projectSchema } from './identifiers.ts'

process.env.DATABASE_URL = process.env.MEW_DB_TEST_DATABASE_URL ?? ''

test('persisted DB references keep source locations and remove only orphaned managed data', { skip: !process.env.MEW_DB_TEST_DATABASE_URL }, async t => {
  const project = `refs_${Math.random().toString(36).slice(2, 10)}`
  const schema = projectSchema(project)
  t.after(async () => {
    try {
      await exec('DELETE FROM mew.databases WHERE project = $1', [project])
      await exec(`DROP SCHEMA IF EXISTS ${quoteIdent(schema)} CASCADE`)
    } finally { await closePool() }
  })
  const db = await createDatabase(project, 'Referenced', null)
  const block = `<div data-mew-db="${db.id}"></div>`
  await syncDatabaseReferences(project, [{ path: 'first.md', content: `${block}\n\n${block}` }, { path: 'second.md', content: block }])
  assert.deepEqual((await listDatabases(project))[0].references, [
    { project, path: 'first.md', line: 1 }, { project, path: 'first.md', line: 3 }, { project, path: 'second.md', line: 1 },
  ])
  await syncDatabaseReferences(project, [{ path: 'first.md', content: `Title\n\n${block}` }])
  await remapDatabaseReferences(project, [{ from: 'second.md', to: 'folder/renamed.md' }])
  assert.deepEqual((await listDatabases(project))[0].references, [
    { project, path: 'first.md', line: 3 }, { project, path: 'folder/renamed.md', line: 1 },
  ])
  await syncDatabaseReferences(project, [{ path: 'first.md', content: '' }])
  assert.equal((await getView(project, db.id)).id, db.id)
  await syncDatabaseReferences(project, [{ path: 'folder/renamed.md', content: null }])
  await assert.rejects(getView(project, db.id), DbObjectNotFoundError)
  await syncDatabaseReferences(project, [{ path: 'folder/renamed.md', content: null, previous: block }])
  assert.deepEqual(await listDatabases(project), [])

  const legacy = await createDatabase(project, 'Legacy', null)
  await syncDatabaseReferences(project, [{ path: 'legacy.md', content: '', previous: `<div data-mew-db="${legacy.id}"></div>` }])
  await assert.rejects(getView(project, legacy.id), DbObjectNotFoundError)

  await exec(`CREATE TABLE ${quoteIdent(schema)}.external_source (title text)`)
  const external = await attachExternal(project, schema, 'external_source', 'Source', null)
  await syncDatabaseReferences(project, [{ path: 'external.md', content: `<div data-mew-db="${external.id}"></div>` }])
  await syncDatabaseReferences(project, [{ path: 'external.md', content: null }])
  assert.deepEqual(await listDatabases(project), [])
  assert.equal((await exec('SELECT to_regclass($1) AS name', [`${schema}.external_source`])).rows[0].name, `${schema}.external_source`)
})
