import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import { createDemoRepositorySource, includeDemoRepositorySource, demoRepositoryContentType,
  MAX_SNAPSHOT_BYTES, MAX_SNAPSHOT_GZIP_BYTES, MAX_REPOSITORY_INDEX_BYTES, MAX_REPOSITORY_INDEX_GZIP_BYTES,
} from '../tools/demo-snapshot.mjs'

const REVISION = 'a7bae991ce8f077af8504beacade86491ba4dc1d'
const INDEX_SHA = '56835c6e18a78b610a8b2ac49324f3374623d54e212bf2f000150aed5c2dcc4f'
const SNAPSHOT_SHA = '68f26820109b8a00b9b67ab1ffb98167dffe099cd0993002e1241bb43e1f67dd'
// Derived fixture identity only; the existing v1/v2 formats have no snapshotId field.
const SNAPSHOT_ID = `${REVISION}:${SNAPSHOT_SHA}:${INDEX_SHA}`
const digest = value => createHash('sha256').update(value).digest('hex')
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const keys = (value, expected) => assert.deepEqual(Object.keys(value).sort(), [...expected].sort())
const regularBytes = filename => {
  const stat = fs.lstatSync(filename)
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'fixture input must be a regular file')
  return fs.readFileSync(filename)
}
const validPath = filename => typeof filename === 'string' && filename.length > 0 &&
  !filename.includes('\\') && !filename.includes('\0') && !path.posix.isAbsolute(filename) &&
  !/^[A-Za-z]:/.test(filename) && !filename.split('/').some(part => !part || part === '.' || part === '..')

const git = (root, args, input) => {
  const result = spawnSync('git', args, { cwd: root, ...(input ? { input } : {}), encoding: 'utf8',
    stdio: ['pipe','pipe','ignore'], timeout: 5000, maxBuffer: 1024 * 1024 })
  assert.equal(result.error, undefined, 'local Git metadata command must run')
  assert.equal(result.status, 0, 'local Git metadata command must succeed')
  return result.stdout
}
const registeredPrimary = root => {
  const common = fs.realpathSync(git(root, ['rev-parse','--path-format=absolute','--git-common-dir']).trim())
  const registered = git(root, ['worktree','list','--porcelain','-z']).split('\0')
    .filter(field => field.startsWith('worktree ')).map(field => field.slice('worktree '.length))
  const primaries = registered.filter(directory => {
    if (!fs.existsSync(directory)) return false
    try {
      const gitDirectory = git(directory, ['rev-parse','--absolute-git-dir']).trim()
      return fs.realpathSync(gitDirectory) === common
    } catch { return false } // An unrelated stale worktree cannot supply the primary.
  })
  assert.equal(primaries.length, 1, 'exactly one registered primary checkout must own the shared Git directory')
  return primaries[0]
}
const fixedPublishedDirectory = (root, requiredOids) => {
  const primary = registeredPrimary(root)
  for (const relative of ['dist/demo','mewlink/dist/demo']) {
    const directory = path.join(primary, relative), repository = path.join(directory, 'repository')
    if (!fs.existsSync(repository)) continue
    const stat = fs.lstatSync(repository)
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'published repository must be a real directory')
    // A different revision need not contain the complete fixed manifest. A
    // selected complete candidate still undergoes every payload hash/type/size
    // check below; wrong bytes fail rather than being served or silently used.
    if (!requiredOids.every(oid => fs.existsSync(path.join(repository, `${oid}.json`)))) continue
    return { directory, relative }
  }
  throw new Error('Fixed demo Git commit and verified published object set are both unavailable; no network fetch is permitted')
}

/** Fixture only: original Git verification first; a fixed published object set only if that commit is absent. */
export async function createDemoRepositoryFixture(expectedIndex, root) {
  assert.ok(object(expectedIndex), 'repository index must be an object')
  assert.match(expectedIndex.revision, /^[a-f0-9]{40}$/, 'repository revision must be a safe Git SHA-1')
  const revision = expectedIndex.revision
  const available = spawnSync('git', ['cat-file', '--batch-check=%(objecttype)'], {
    cwd: root, input: `${revision}^{commit}\n`, encoding: 'utf8', stdio: ['pipe','pipe','ignore'], timeout: 5000,
  })
  assert.equal(available.error, undefined, 'local Git object availability probe must run')
  assert.equal(available.status, 0, 'local Git object availability probe must succeed')
  if (available.stdout.trim() === 'commit') return createDemoRepositorySource(expectedIndex, root)
  assert.equal(available.stdout.trim(), `${revision}^{commit} missing`, 'fallback requires an absent commit')
  assert.equal(revision, REVISION, 'No verified published fallback exists for this missing demo revision')

  const indexBytes = regularBytes(path.join(root, 'src/demo/repository-index.json'))
  const snapshotBytes = regularBytes(path.join(root, 'src/demo/repository-snapshot.json'))
  assert.equal(digest(indexBytes), INDEX_SHA, 'fixed repository-index bytes must match')
  assert.equal(digest(snapshotBytes), SNAPSHOT_SHA, 'fixed eager snapshot bytes must match')
  assert.ok(indexBytes.length <= MAX_REPOSITORY_INDEX_BYTES && gzipSync(indexBytes).length <= MAX_REPOSITORY_INDEX_GZIP_BYTES)
  assert.ok(snapshotBytes.length <= MAX_SNAPSHOT_BYTES && gzipSync(snapshotBytes).length <= MAX_SNAPSHOT_GZIP_BYTES)
  const index = JSON.parse(indexBytes.toString('utf8')), snapshot = JSON.parse(snapshotBytes.toString('utf8'))
  assert.ok(object(index) && object(snapshot)); keys(index, ['format','revision','files']); keys(snapshot, ['format','revision','files'])
  assert.equal(index.format, 'mew-demo-snapshot/v2'); assert.equal(snapshot.format, 'mew-demo-snapshot/v1')
  assert.equal(index.revision, REVISION); assert.equal(snapshot.revision, REVISION)
  assert.equal(`${index.revision}:${digest(snapshotBytes)}:${digest(indexBytes)}`, SNAPSHOT_ID)
  assert.deepEqual(index, expectedIndex)
  assert.ok(object(index.files) && object(snapshot.files))
  assert.equal(Object.keys(index.files).length, 2003); assert.equal(Object.keys(snapshot.files).length, 111)
  for (const [filename, entry] of Object.entries(index.files)) {
    assert.ok(validPath(filename) && includeDemoRepositorySource(filename) && object(entry)); keys(entry, ['oid','size','binary'])
    assert.match(entry.oid, /^[a-f0-9]{64}$/); assert.ok(Number.isSafeInteger(entry.size) && entry.size >= 0)
    assert.equal(typeof entry.binary, 'boolean')
  }
  for (const [filename, content] of Object.entries(snapshot.files)) assert.ok(validPath(filename) && includeDemoRepositorySource(filename) && typeof content === 'string')


  // Current UI code is bundled by the original browser fixture. Published JS
  // bundles are neither imported nor trusted; fixed index/eager hashes and each
  // content-addressed payload identify the exact historical data independently.
  const published = fixedPublishedDirectory(root, Object.values(index.files).map(entry => entry.oid))
  const directory = path.join(published.directory, 'repository')
  assert.ok(fs.lstatSync(directory).isDirectory() && !fs.lstatSync(directory).isSymbolicLink())
  const payloads = new Map(), decoded = new Map(), entries = new Map()
  let payloadBytes = 0
  for (const [filename, entry] of Object.entries(index.files)) {
    const extension = path.posix.extname(filename).slice(1).toLowerCase()
    if (!entries.has(entry.oid)) entries.set(entry.oid, { entry, extensions: new Set() })
    const existing = entries.get(entry.oid)
    assert.deepEqual(existing.entry, entry, 'one object digest cannot claim different metadata')
    existing.extensions.add(extension)
    if (payloads.has(entry.oid)) continue
    const bytes = regularBytes(path.join(directory, `${entry.oid}.json`))
    payloadBytes += bytes.length; assert.ok(payloadBytes <= 64 * 1024 * 1024, 'fixed published payload-byte budget')
    assert.equal(digest(bytes), entry.oid, 'published payload must match its content address')
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes), value = JSON.parse(raw)
    assert.ok(object(value)); keys(value, [entry.binary ? 'base64' : 'content'])
    let content
    if (entry.binary) {
      assert.equal(typeof value.base64, 'string'); content = Buffer.from(value.base64, 'base64')
      assert.equal(content.toString('base64'), value.base64, 'binary payload must be canonical base64')
    } else {
      assert.equal(typeof value.content, 'string'); content = Buffer.from(value.content, 'utf8')
    }
    assert.equal(content.length, entry.size, 'published payload size/type must match the fixed index')
    payloads.set(entry.oid, raw); decoded.set(entry.oid, content)
  }
  for (const [filename, content] of Object.entries(snapshot.files)) {
    const entry = index.files[filename]
    assert.ok(entry && !entry.binary)
    assert.equal(JSON.parse(payloads.get(entry.oid)).content, content, 'eager and lazy snapshots must describe the same fixed content')
  }
  const requireEntry = oid => { const found = entries.get(oid); assert.ok(found, 'object must belong to the fixed index'); return found }
  const load = oid => { requireEntry(oid); return payloads.get(oid) }
  const loadRaw = oid => {
    const found = requireEntry(oid), extension = found.extensions.values().next().value
    return { bytes: Buffer.from(decoded.get(oid)), contentType: demoRepositoryContentType(extension) }
  }
  return {
    fixtureProvenance: { source: 'fixed-published-artifact', revision: REVISION, snapshotId: SNAPSHOT_ID, publishedRelative: published.relative, gitTreeVerified: false },
    has: oid => entries.has(oid), isBinary: oid => entries.get(oid)?.entry.binary === true,
    rawExtensions: oid => [...requireEntry(oid).extensions].sort(), load, loadRaw,
    loadBinary: oid => { assert.equal(requireEntry(oid).entry.binary, true); return loadRaw(oid) },
    *objects() { yield* payloads.entries() },
  }
}
