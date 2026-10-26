import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { DatabaseSync } from 'node:sqlite'

// All files and databases are disposable fixtures; no app server or build is started.
const files = Number(process.env.MEW_SEARCH_BENCH_FILES ?? 4000)
const rounds = Number(process.env.MEW_SEARCH_BENCH_ROUNDS ?? 5)
const otherProjectFiles = Number(process.env.MEW_SEARCH_BENCH_OTHER_FILES ?? 30_000)
assert.ok(Number.isInteger(files) && files > 0 && files <= 4000)
assert.ok(Number.isInteger(rounds) && rounds > 0 && rounds <= 20)
assert.ok(Number.isInteger(otherProjectFiles) && otherProjectFiles > 0 && otherProjectFiles <= 100_000)
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-search-benchmark-'))
const originalLoadEnvFile = process.loadEnvFile
let database
let commonDatabase
let resetSearchIndex
let resetFileCatalogs
const timed = async run => {
  const started = performance.now()
  const result = await run()
  return { ms: performance.now() - started, result }
}
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
const roundMs = value => Math.round(value * 1000) / 1000
const projectScope = project => crypto.createHash('sha256').update(project).digest('hex')
const quoteFts = value => `"${value.replaceAll('"', '""')}"`
const queryCases = (db, literal, project) => {
  const prepare = join => db.prepare(`
    SELECT f.path AS path FROM search_fts s ${join} search_files f ON f.id=s.rowid
    WHERE search_fts MATCH ? AND f.project=?
  `)
  const unscopedParams = [`body : ${quoteFts(literal)}`, project]
  return {
    legacy: { statement: prepare('JOIN'), params: unscopedParams },
    unscoped: { statement: prepare('CROSS JOIN'), params: unscopedParams },
    current: { statement: prepare('CROSS JOIN'), params: [`body : ${quoteFts(literal)} AND scope : ${quoteFts(projectScope(project))}`, project] },
  }
}
const queryOrder = round => round % 2 ? ['current', 'unscoped', 'legacy'] : ['legacy', 'unscoped', 'current']

try {
  process.loadEnvFile = () => {}
  process.env.MEW_WORKSPACE = path.join(root, 'workspace')
  process.env.MEW_DATA_DIR = path.join(root, 'data')
  process.env.MEW_DOCS = 'docs'
  process.env.MEW_SEARCH_INDEX_ENABLED = '1'
  process.env.MEW_PERF_LOG = '0'
  const project = 'fixture'
  const projectRoot = path.join(process.env.MEW_WORKSPACE, project)
  fs.mkdirSync(path.join(projectRoot, '.mew'), { recursive: true })
  const index = await import('./searchCatalog.ts')
  resetSearchIndex = index.resetSearchIndex
  const catalog = await import('./fileCatalog.ts')
  resetFileCatalogs = catalog.resetFileCatalogs
  const { requiredSearchLiteral } = await import('./search-pattern.ts')
  const { searchInProjectProgressively } = await import('./search.ts')
  const options = { regex: false, caseSensitive: false }
  const query = 'unique*workspace phrase'
  const literal = requiredSearchLiteral(query, options)
  assert.ok(literal)
  const paths = Array.from({ length: files }, (_, i) => `file-${String(i).padStart(4, '0')}.txt`)
  const samples = []
  const scan = async selected => {
    const results = []
    const result = await searchInProjectProgressively(project, selected, query, options, file => results.push(file))
    return { ...result, results }
  }
  const indexedScan = () => {
    const candidates = index.exactSearchCandidates(project, literal, new Set(paths)).paths
    assert.deepEqual(candidates, [paths.at(-1)])
    const selected = new Set(candidates)
    return scan(paths.filter(file => selected.has(file)))
  }
  for (const [index, file] of paths.entries()) {
    fs.writeFileSync(path.join(projectRoot, file), `${'ordinary search row with no relevant term\n'.repeat(12)}${index === files - 1 ? 'unique value workspace phrase\n' : ''}`)
  }
  const build = await timed(async () => {
    index.ensureSearchIndex(project, paths)
    assert.equal(await index.waitForSearchIndex(project), 'ready')
  })
  database = new DatabaseSync(index.searchIndexDatabasePath(), { readOnly: true })
  const queries = queryCases(database, literal, project)
  const expected = queries.legacy.statement.all(...queries.legacy.params)
  assert.deepEqual(expected.map(row => row.path), [paths.at(-1)])
  for (const { statement, params } of Object.values(queries)) assert.deepEqual(statement.all(...params), expected)
  const expectedResults = await scan(paths)
  assert.deepEqual(expectedResults.results.map(file => file.path), [paths.at(-1)])
  assert.deepEqual(await indexedScan(), expectedResults)

  for (let round = 0; round < rounds; round++) {
    const sample = { round }
    for (const variant of queryOrder(round)) {
      const { statement, params } = queries[variant]
      const measured = await timed(() => statement.all(...params))
      assert.deepEqual(measured.result, expected)
      sample[`${variant}QueryMs`] = measured.ms
    }
    for (const variant of round % 2 ? ['indexed', 'scanner'] : ['scanner', 'indexed']) {
      const measured = await timed(() => variant === 'scanner' ? scan(paths) : indexedScan())
      assert.deepEqual(measured.result, expectedResults)
      sample[`${variant}Ms`] = measured.ms
    }
    samples.push(sample)
  }
  commonDatabase = new DatabaseSync(':memory:')
  commonDatabase.exec(`
    CREATE TABLE search_files (id INTEGER PRIMARY KEY, project TEXT NOT NULL, path TEXT NOT NULL, UNIQUE(project,path));
    CREATE VIRTUAL TABLE search_fts USING fts5(body, scope, tokenize='trigram');
    BEGIN;
  `)
  const insertFile = commonDatabase.prepare('INSERT INTO search_files(id,project,path) VALUES (?,?,?)')
  const insertFts = commonDatabase.prepare('INSERT INTO search_fts(rowid,body,scope) VALUES (?,?,?)')
  insertFile.run(1, 'small', 'target.txt')
  insertFts.run(1, 'shared common phrase', projectScope('small'))
  const otherScope = projectScope('other')
  for (let i = 0; i < otherProjectFiles; i++) {
    insertFile.run(i + 2, 'other', `other-${i}.txt`)
    insertFts.run(i + 2, 'shared common phrase', otherScope)
  }
  commonDatabase.exec('COMMIT')
  const commonQueries = queryCases(commonDatabase, 'shared common phrase', 'small')
  const commonSamples = []
  for (let round = 0; round < rounds; round++) {
    const sample = { round }
    for (const variant of queryOrder(round)) {
      const { statement, params } = commonQueries[variant]
      const measured = await timed(() => statement.all(...params))
      assert.deepEqual(measured.result.map(row => row.path), ['target.txt'])
      sample[`${variant}QueryMs`] = measured.ms
    }
    commonSamples.push(sample)
  }
  console.log(JSON.stringify({
    kind: 'synthetic-local-search', node: process.version,
    sqlite: database.prepare('SELECT sqlite_version() AS version').get().version,
    files, rounds, candidates: expected.length, buildMs: roundMs(build.ms),
    medians: Object.fromEntries(['legacyQueryMs', 'unscopedQueryMs', 'currentQueryMs', 'scannerMs', 'indexedMs'].map(key => [key, roundMs(median(samples.map(sample => sample[key])))])),
    samples: samples.map(sample => Object.fromEntries(Object.entries(sample).map(([key, value]) => [key, roundMs(value)]))),
    smallProjectCommonTerm: {
      targetProjectFiles: 1, otherProjectFiles,
      medians: Object.fromEntries(['legacyQueryMs', 'unscopedQueryMs', 'currentQueryMs'].map(key => [key, roundMs(median(commonSamples.map(sample => sample[key])))])),
      samples: commonSamples.map(sample => Object.fromEntries(Object.entries(sample).map(([key, value]) => [key, roundMs(value)]))),
    },
  }, null, 2))
} finally {
  database?.close()
  commonDatabase?.close()
  resetFileCatalogs?.()
  resetSearchIndex?.()
  process.loadEnvFile = originalLoadEnvFile
  fs.rmSync(root, { recursive: true, force: true })
}
