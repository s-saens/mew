import '../test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse } from 'yaml'
import { readyFileCatalog, resetFileCatalogs } from '../fileCatalog.ts'
import { workspaceContext, pathsForWorkspace } from '../paths.ts'
import { rowPageName, syncDatabasePages, withDeferredRowPageMoves, withRowPageDraft } from './rowPages.ts'
import { DocumentPages } from '../document-pages.ts'
import { remapPagePath } from '../../shared/document-pages.ts'
import type { DatabaseView } from './databaseService.ts'
import type { Exec } from './pool.ts'

const dbId = '11111111-1111-4111-8111-111111111111'
const rowId = '22222222-2222-4222-8222-222222222222'
const view = (ownerPath: string): DatabaseView => ({ id: dbId, title: '사람', kind: 'managed', editable: true, ownerPath,
  columns: [{ id: 'title', name: '제목', type: 'page' }], rows: [{ id: rowId, pos: 0, cells: { title: '송상훈' } }] })

function fixture(t: test.TestContext, run: (root: string, q: Exec, records: Map<string, { row_id: string; path: string; baseline: unknown }>, databases: Map<string, string>) => Promise<void>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-row-layout-'))
  fs.mkdirSync(path.join(root, 'docs'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const records = new Map<string, { row_id: string; path: string; baseline: unknown }>()
  const databases = new Map<string, string>()
  const q = (async (sql: string, args: unknown[] = []) => {
    if (sql.startsWith('SELECT row_id')) return { rows: [...records.values()], rowCount: records.size }
    if (sql.startsWith('SELECT id, owner_path')) return { rows: [...databases].map(([id, owner_path]) => ({ id, owner_path })), rowCount: databases.size }
    if (sql.startsWith('SELECT p.database_id')) return { rows: [...records.values()].map(record => ({ ...record, database_id: dbId })), rowCount: records.size }
    if (sql.startsWith('UPDATE mew.databases SET owner_path')) databases.set(String(args[1]), String(args[0]))
    if (sql.startsWith('UPDATE mew.row_pages SET path')) records.get(String(args[2]))!.path = String(args[0])
    if (sql.startsWith('DELETE FROM mew.row_pages')) records.delete(String(args[1]))
    if (sql.startsWith('INSERT INTO mew.row_pages')) records.set(String(args[1]), { row_id: String(args[1]), path: String(args[2]), baseline: JSON.parse(String(args[3])) })
    return { rows: [], rowCount: 0 }
  }) as Exec
  return workspaceContext.run(pathsForWorkspace(root, null), async () => {
    try { await run(path.join(root, 'docs'), q, records, databases) }
    finally { await readyFileCatalog('docs'); resetFileCatalogs() }
  })
}

test('row pages promote their owner and use the row title, preserving links and IDs', t => fixture(t, async (root, q, records) => {
  fs.writeFileSync(path.join(root, '사람.md'), '# 사람\n\n[연결](참조.md)\n')
  fs.writeFileSync(path.join(root, '참조.md'), '[사람](사람.md)\n')
  const current = view('사람.md')
  const change = await syncDatabasePages('docs', current, q)
  assert.equal(current.ownerPath, '사람/_사람.md')
  assert.equal(records.get(rowId)?.path, '사람/송상훈.md')
  const content = fs.readFileSync(path.join(root, '사람/송상훈.md'), 'utf8')
  const fields = parse(content.split('---')[1])
  assert.equal(fields._mew_row, rowId)
  assert.equal(fields.상위파일, '_사람.md')
  assert.match(fs.readFileSync(path.join(root, '사람/_사람.md'), 'utf8'), /\.\.\//)
  assert.match(fs.readFileSync(path.join(root, '참조.md'), 'utf8'), /_.*\.md/)
  assert.equal(fs.existsSync(path.join(root, '데이터베이스')), false)
  assert.equal(change.mutation?.moves[0].from, '사람.md')
  change.rollback()
  assert.equal(fs.existsSync(path.join(root, '사람')), false)
  assert.equal(fs.readFileSync(path.join(root, '참조.md'), 'utf8'), '[사람](사람.md)\n')
  assert.equal(fs.existsSync(path.join(root, '사람.md')), true)
}))

test('legacy UUID pages migrate under the actual owner without losing bodies, fields or link targets', t => fixture(t, async (root, q, records) => {
  fs.mkdirSync(path.join(root, 'Books'))
  const owner = 'Books/_Books.md', old = `데이터베이스/${dbId}/${rowId}.md`, rep = `데이터베이스/${dbId}/_${dbId}.md`
  fs.writeFileSync(path.join(root, owner), `<div data-mew-db="${dbId}"></div>\n`)
  fs.mkdirSync(path.dirname(path.join(root, old)), { recursive: true })
  fs.writeFileSync(path.join(root, rep), `---\n_mew_database: ${dbId}\ntitle: 사람\n---\n\n`)
  fs.writeFileSync(path.join(root, old), `---\n_mew_database: ${dbId}\n_mew_row: ${rowId}\ntitle: 송상훈\n메모: 보존\n---\n# 본문\n[참조](../../참조.md)\n`)
  fs.writeFileSync(path.join(root, '참조.md'), `[행](${old})\n`)
  records.set(rowId, { row_id: rowId, path: old, baseline: {} })
  const current = { ...view('Books.md'), ownerPath: null } // Recover an owner missing from old DB metadata.
  const change = await syncDatabasePages('docs', current, q)
  assert.equal(current.ownerPath, owner)
  assert.equal(records.get(rowId)?.path, 'Books/송상훈.md')
  const content = fs.readFileSync(path.join(root, 'Books/송상훈.md'), 'utf8')
  assert.match(content, /메모: 보존/)
  assert.match(content, /# 본문/)
  assert.match(content, /\.\.\//)
  assert.equal(fs.existsSync(path.join(root, old)), false)
  change.commit()
  assert.equal(fs.existsSync(path.join(root, '데이터베이스')), false)
  assert.match(fs.readFileSync(path.join(root, '참조.md'), 'utf8'), /Books\//)
  const oldRuntimeRep = `Books/데이터베이스/${dbId}/_${dbId}.md`
  fs.mkdirSync(path.dirname(path.join(root, oldRuntimeRep)), { recursive: true })
  fs.writeFileSync(path.join(root, oldRuntimeRep), `---\n_mew_database: ${dbId}\n---\n\n`)
  const repeat = await syncDatabasePages('docs', current, q)
  assert.equal(repeat.mutation, undefined)
  repeat.commit()
  assert.equal(fs.existsSync(path.join(root, 'Books/데이터베이스')), false)
}))

test('title collisions with files and folders never overwrite unrelated content', t => fixture(t, async (root, q, records) => {
  fs.mkdirSync(path.join(root, 'Books'))
  fs.writeFileSync(path.join(root, 'Books/_Books.md'), '# Books')
  fs.writeFileSync(path.join(root, 'Books/송상훈.md'), '원본')
  fs.mkdirSync(path.join(root, 'Books/송상훈 2'))
  const change = await syncDatabasePages('docs', view('Books/_Books.md'), q)
  assert.equal(records.get(rowId)?.path, 'Books/송상훈 3.md')
  assert.equal(fs.readFileSync(path.join(root, 'Books/송상훈.md'), 'utf8'), '원본')
  change.rollback()
}))

test('owner promotion collisions leave the owner and all files intact', t => fixture(t, async (root, q) => {
  fs.writeFileSync(path.join(root, '사람.md'), '# 사람')
  fs.mkdirSync(path.join(root, '사람'))
  await assert.rejects(syncDatabasePages('docs', view('사람.md'), q), /겹칩니다/)
  assert.equal(fs.readFileSync(path.join(root, '사람.md'), 'utf8'), '# 사람')
  assert.deepEqual(fs.readdirSync(path.join(root, '사람')), [])
}))

test('row filenames keep natural names and neutralize path separators and reserved names', () => {
  assert.equal(rowPageName('송상훈'), '송상훈')
  assert.equal(rowPageName('../../경로'), '페이지 .. .. 경로')
  for (const title of ['CON', '_Books', 'MOC', 'archives', '.', '책/독서: 질문?', '😀'.repeat(100)]) {
    const name = rowPageName(title)
    assert.doesNotMatch(name, /[\\/:?]/)
    assert.ok(Buffer.byteLength(name) < 220)
    assert.ok(!name.startsWith('.') && !name.startsWith('_'))
  }
})

test('page title edits rename files and links while preserving row identity, fields and bodies', t => fixture(t, async (root, q, records) => {
  fs.mkdirSync(path.join(root, 'Books'))
  fs.writeFileSync(path.join(root, 'Books/_Books.md'), '# Books\n')
  const current = view('Books/_Books.md')
  ;(await syncDatabasePages('docs', current, q)).commit()
  const old = records.get(rowId)!.path, next = 'Books/거북목 알리미.md'
  const original = fs.readFileSync(path.join(root, old), 'utf8').replace(/description:.*\n/, 'description: Authored description\ncustom: keep\n') + '\n# Notes\nBody\n'
  delete (records.get(rowId)!.baseline as { pathTitle?: string }).pathTitle // Existing installations have only shared field baselines.
  fs.writeFileSync(path.join(root, old), original)
  fs.writeFileSync(path.join(root, 'Reference.md'), `[row](${encodeURI(old)}#notes)\n[[${old}|row]]\n\`${old}\`\n`)
  current.rows[0].cells.title = '거북목 알리미'
  const change = await syncDatabasePages('docs', current, q)
  assert.equal(records.get(rowId)!.path, next)
  assert.equal(fs.existsSync(path.join(root, old)), false)
  const renamed = fs.readFileSync(path.join(root, next), 'utf8'), fields = parse(renamed.split('---')[1])
  assert.equal(fields.title, '거북목 알리미')
  assert.equal(fields._mew_row, rowId)
  assert.equal(fields._mew_database, dbId)
  assert.equal(fields.description, 'Authored description')
  assert.equal(fields.custom, 'keep')
  assert.ok(renamed.endsWith('\n# Notes\nBody\n'))
  const reference = fs.readFileSync(path.join(root, 'Reference.md'), 'utf8')
  assert.ok(decodeURI(reference).includes(`[row](${next}#notes)`))
  assert.ok(decodeURI(reference).includes(`[[${next}|row]]`))
  assert.ok(reference.includes(`\`${old}\``), 'code remains unchanged')
  assert.equal(remapPagePath(old, change.mutation!.moves), next)
  change.commit()
  const repeat = await syncDatabasePages('docs', current, q)
  assert.equal(repeat.mutation, undefined, 'confirmed names do not repeatedly rename')
  repeat.commit()
}))

test('renames choose safe collision suffixes and keep manually selected directories', t => fixture(t, async (root, q, records) => {
  fs.mkdirSync(path.join(root, 'Books'))
  fs.writeFileSync(path.join(root, 'Books/_Books.md'), '# Books\n')
  const current = view('Books/_Books.md')
  ;(await syncDatabasePages('docs', current, q)).commit()
  const old = records.get(rowId)!.path
  fs.mkdirSync(path.join(root, 'Archive'))
  fs.renameSync(path.join(root, old), path.join(root, 'Archive/Custom.md'))
  records.get(rowId)!.path = 'Archive/Custom.md'
  ;(await syncDatabasePages('docs', current, q)).commit()
  assert.equal(records.get(rowId)!.path, 'Archive/Custom.md', 'unrelated sync preserves manual paths')
  fs.writeFileSync(path.join(root, 'Archive/연구 실험.md'), 'Unrelated file')
  fs.mkdirSync(path.join(root, 'Archive/연구 실험 2'))
  current.rows[0].cells.title = '연구 / 실험?'
  ;(await syncDatabasePages('docs', current, q)).commit()
  assert.equal(records.get(rowId)!.path, 'Archive/연구 실험 3.md')
  assert.equal(fs.readFileSync(path.join(root, 'Archive/연구 실험.md'), 'utf8'), 'Unrelated file')
  assert.deepEqual(fs.readdirSync(path.join(root, 'Archive/연구 실험 2')), [])
  assert.equal(parse(fs.readFileSync(path.join(root, records.get(rowId)!.path), 'utf8').split('---')[1]).title, '연구 / 실험?')
  current.rows[0].cells.title = '연구 : 실험?'
  const normalized = await syncDatabasePages('docs', current, q)
  assert.equal(records.get(rowId)!.path, 'Archive/연구 실험 3.md')
  assert.equal(normalized.mutation, undefined, 'equivalent normalized names keep their suffix')
  normalized.commit()
}))

test('row page autosaves defer renames and retain the last filename title until ordinary synchronization', t => fixture(t, async (root, q, records) => {
  fs.mkdirSync(path.join(root, 'Books'))
  fs.writeFileSync(path.join(root, 'Books/_Books.md'), '# Books\n')
  const current = view('Books/_Books.md')
  ;(await syncDatabasePages('docs', current, q)).commit()
  const old = records.get(rowId)!.path
  const draft = fs.readFileSync(path.join(root, old), 'utf8').replace('title: 송상훈', 'title: Updated') + '\nAutosaved body\n'
  current.rows[0].cells.title = 'Updated'
  const deferred = await withRowPageDraft('docs', old, draft, () => syncDatabasePages('docs', current, q))
  assert.equal(deferred.mutation, undefined)
  assert.equal(records.get(rowId)!.path, old)
  assert.equal((records.get(rowId)!.baseline as { pathTitle: string }).pathTitle, '송상훈')
  assert.match(fs.readFileSync(path.join(root, old), 'utf8'), /title: Updated/)
  deferred.commit()
  const renamed = await syncDatabasePages('docs', current, q)
  assert.equal(records.get(rowId)!.path, 'Books/Updated.md')
  assert.match(fs.readFileSync(path.join(root, 'Books/Updated.md'), 'utf8'), /Autosaved body/)
  assert.equal((records.get(rowId)!.baseline as { pathTitle: string }).pathTitle, 'Updated')
  renamed.commit()
}))

test('background field refreshes leave deferred path mutations for the next ordinary client request', t => fixture(t, async (root, q, records) => {
  fs.mkdirSync(path.join(root, 'Books'))
  fs.writeFileSync(path.join(root, 'Books/_Books.md'), '# Books\n')
  const current = view('Books/_Books.md')
  ;(await syncDatabasePages('docs', current, q)).commit()
  const old = records.get(rowId)!.path
  current.rows[0].cells.title = 'Pending rename'
  const background = await withDeferredRowPageMoves(() => syncDatabasePages('docs', current, q))
  assert.equal(background.mutation, undefined)
  assert.equal(records.get(rowId)!.path, old)
  assert.equal((records.get(rowId)!.baseline as { pathTitle: string }).pathTitle, '송상훈')
  background.commit()
  const request = await syncDatabasePages('docs', current, q)
  assert.equal(remapPagePath(old, request.mutation!.moves), 'Books/Pending rename.md')
  assert.equal(records.get(rowId)!.path, 'Books/Pending rename.md')
  request.commit()
}))

test('parent and child row renames preserve attachments, compose original paths and roll back together', t => fixture(t, async (root, q, records, databases) => {
  fs.mkdirSync(path.join(root, 'Books'))
  fs.writeFileSync(path.join(root, 'Books/_Books.md'), '# Books\n')
  const current = view('Books/_Books.md')
  ;(await syncDatabasePages('docs', current, q)).commit()
  const oldLeaf = records.get(rowId)!.path
  const promotion = new DocumentPages(root).create(oldLeaf, 'Child')
  const oldParent = 'Books/송상훈/_송상훈.md', oldChild = promotion.path, childId = 'child-row'
  records.get(rowId)!.path = oldParent
  const childContent = `---\ntitle: Child\n_mew_database: ${dbId}\n_mew_row: ${childId}\n---\nChild body\n[Parent](_${'송상훈'}.md)\n`
  fs.writeFileSync(path.join(root, oldChild), childContent)
  const asset = Buffer.from([0, 255, 16, 42])
  fs.writeFileSync(path.join(root, 'Books/송상훈/asset.bin'), asset)
  records.set(childId, { row_id: childId, path: oldChild, baseline: { columns: current.columns, cells: { title: 'Child' }, pathTitle: 'Child' } })
  databases.set('nested-database', oldChild)
  current.rows.push({ id: childId, pos: 1, cells: { title: 'New child' } })
  current.rows[0].cells.title = 'New parent'
  fs.writeFileSync(path.join(root, 'Reference.md'), `[parent](${encodeURI(oldParent)})\n[child](${encodeURI(oldChild)})\n`)
  const reference = fs.readFileSync(path.join(root, 'Reference.md'), 'utf8')
  const change = await syncDatabasePages('docs', current, q)
  const nextParent = 'Books/New parent/_New parent.md', nextChild = 'Books/New parent/New child.md'
  assert.equal(records.get(rowId)!.path, nextParent)
  assert.equal(records.get(childId)!.path, nextChild)
  assert.equal(databases.get('nested-database'), nextChild)
  assert.deepEqual(fs.readFileSync(path.join(root, 'Books/New parent/asset.bin')), asset)
  assert.equal(remapPagePath(oldParent, change.mutation!.moves), nextParent)
  assert.equal(remapPagePath(oldChild, change.mutation!.moves), nextChild)
  assert.equal(remapPagePath('Books/송상훈/asset.bin', change.mutation!.moves), 'Books/New parent/asset.bin')
  assert.match(fs.readFileSync(path.join(root, nextChild), 'utf8'), /Child body/)
  change.rollback()
  assert.equal(fs.existsSync(path.join(root, 'Books/New parent')), false)
  assert.equal(fs.readFileSync(path.join(root, oldChild), 'utf8'), childContent)
  assert.deepEqual(fs.readFileSync(path.join(root, 'Books/송상훈/asset.bin')), asset)
  assert.equal(fs.readFileSync(path.join(root, 'Reference.md'), 'utf8'), reference)
}))

test('a database failure after a rename restores original files and rewritten links', t => fixture(t, async (root, q, records) => {
  fs.mkdirSync(path.join(root, 'Books'))
  fs.writeFileSync(path.join(root, 'Books/_Books.md'), '# Books\n')
  const current = view('Books/_Books.md')
  ;(await syncDatabasePages('docs', current, q)).commit()
  const old = records.get(rowId)!.path, original = fs.readFileSync(path.join(root, old), 'utf8')
  const reference = `[row](${encodeURI(old)})\n`
  fs.writeFileSync(path.join(root, 'Reference.md'), reference)
  current.rows[0].cells.title = 'New title'
  const fail = (async (sql: string, args: unknown[]) => {
    if (sql.startsWith('INSERT INTO mew.row_pages')) throw new Error('simulated transaction failure')
    return q(sql, args)
  }) as Exec
  await assert.rejects(syncDatabasePages('docs', current, fail), /simulated transaction failure/)
  assert.equal(fs.existsSync(path.join(root, 'Books/New title.md')), false)
  assert.equal(fs.readFileSync(path.join(root, old), 'utf8'), original)
  assert.equal(fs.readFileSync(path.join(root, 'Reference.md'), 'utf8'), reference)
}))
