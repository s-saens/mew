import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { candidateFiles, coverage, median, pathEvidence, percentile, rgArguments } from './graphify-benchmark.mjs'

test('timing summaries use numeric order, handle empty samples, and preserve input', () => {
  const values = [100, 2, 10, 4]
  assert.equal(median(values), 7)
  assert.equal(median([100, 2, 10]), 10)
  assert.equal(median([]), null)
  assert.equal(percentile(values, 0), 2)
  assert.equal(percentile(values, 0.5), 4)
  assert.equal(percentile(values, 0.95), 100)
  assert.equal(percentile(values, 1), 100)
  assert.equal(percentile([], 0.95), null)
  assert.throws(() => percentile(values, -0.01), /between 0 and 1/)
  assert.throws(() => percentile(values, 1.01), /between 0 and 1/)
  assert.deepEqual(values, [100, 2, 10, 4])
})

test('candidate extraction rejects path substrings and accepts source-location delimiters', () => {
  const file = 'server/search.ts'
  const falseMatches = [
    `other/${file}`, `${file}x`, `${file}.backup`, `${file}/child`,
    `prefix-${file}`, `prefix_${file}`, `prefix.${file}`,
  ].join('\n')
  assert.deepEqual(candidateFiles(falseMatches, [file]), [])
  assert.deepEqual(candidateFiles(`${falseMatches}\n[${file}:L39]\n`, [file]), [file])
  assert.deepEqual(candidateFiles(`"${file}"\n${file}:39:definition`, [file]), [file])
})

test('candidate extraction preserves first output occurrence rather than corpus order', () => {
  const files = ['src/first.ts', 'src/second.ts', 'src/third.ts']
  const output = 'src/third.ts:9\nsrc/first.ts:1\nsrc/third.ts:10\nsrc/second.ts:5'
  assert.deepEqual(candidateFiles(output, files), ['src/third.ts', 'src/first.ts', 'src/second.ts'])
  assert.deepEqual(candidateFiles('unknown/file.ts', files), [])
})

test('coverage deduplicates gold and scores the requested output prefix', () => {
  const candidates = Array.from({ length: 12 }, (_, index) => `src/file-${index}.ts`)
  const expected = [candidates[0], candidates[10], candidates[10]]
  assert.equal(coverage(expected, candidates), 1)
  assert.equal(coverage(expected, candidates, 10), 0.5)
  assert.equal(coverage(expected, candidates, 0), 0)
  assert.equal(coverage(['missing.ts'], candidates), 0)
  assert.equal(coverage([], candidates), null)
  assert.equal(coverage(['a.ts', 'b.ts'], ['a.ts', 'a.ts']), 0.5)
})

test('connection paths only count as forward call paths when every edge is a call', () => {
  assert.deepEqual(pathEvidence('Shortest path (2 hops):\n  A() --calls [EXTRACTED]--> B() --indirect_call [INFERRED]--> C()'),
    { relations: ['calls', 'indirect_call'], forwardCallOnly: true })
  assert.equal(pathEvidence('A() <--contains [EXTRACTED]-- module.ts --contains [EXTRACTED]--> B()').forwardCallOnly, false)
  assert.equal(pathEvidence('A() <--calls [EXTRACTED]-- B()').forwardCallOnly, false)
  assert.equal(pathEvidence('A() --imports [EXTRACTED]--> B()').forwardCallOnly, false)
  assert.equal(pathEvidence('No path found').forwardCallOnly, false)
})

test('ripgrep baseline searches literal whole symbols in exactly the supplied corpus', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'mew-graphify-benchmark-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(path.join(root, 'src'))
  writeFileSync(path.join(root, 'src/a.ts'), 'CALL.V1\ncallXv1\ncall.v1Suffix\n')
  writeFileSync(path.join(root, 'src/z file.ts'), 'call.v1\notherSymbol\n')
  writeFileSync(path.join(root, 'src/outside.ts'), 'call.v1\n')
  const config = path.join(root, 'rg-config')
  writeFileSync(config, '--ignore-case\n')
  // collectSources supplies a sorted corpus; rg keeps explicit argument order.
  const files = ['src/a.ts', 'src/z file.ts']
  const args = rgArguments({ rgTerms: ['call.v1', 'otherSymbol'] }, files)
  assert.ok(args.includes('--no-config'))
  assert.ok(args.includes('--fixed-strings'))
  assert.equal(args[args.indexOf('--sort') + 1], 'path')
  assert.deepEqual(args.slice(args.indexOf('--') + 1), files)
  const result = spawnSync('rg', args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, RIPGREP_CONFIG_PATH: config },
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, 'src/z file.ts:1:call.v1\nsrc/z file.ts:2:otherSymbol\n')

  writeFileSync(path.join(root, 'src/a.ts'), 'call.v1\n')
  const sorted = spawnSync('rg', args, { cwd: root, encoding: 'utf8' })
  assert.equal(sorted.status, 0, sorted.stderr)
  assert.equal(sorted.stdout.split('\n')[0], 'src/a.ts:1:call.v1')
})
