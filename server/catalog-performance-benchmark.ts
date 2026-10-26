import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

const count = Number(process.argv[2] ?? 5000)
const iterations = Number(process.argv[3] ?? 7)
if (!Number.isInteger(count) || count < 1 || count > 20_000 || !Number.isInteger(iterations) || iterations < 1 || iterations > 15) {
  throw new Error('Usage: node server/catalog-performance-benchmark.ts [files:1..20000] [iterations:1..15]')
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-catalog-benchmark-'))
const originalLoadEnvFile = process.loadEnvFile
try {
  // This isolated process uses only synthetic files and never loads host configuration.
  process.loadEnvFile = () => {}
  process.env.MEW_DATA_DIR = path.join(temporary, 'state')
  process.env.MEW_WORKSPACE = path.join(temporary, 'workspace')
  process.env.MEW_DOCS = 'docs'
  fs.mkdirSync(process.env.MEW_DATA_DIR)
  const project = path.join(process.env.MEW_WORKSPACE, 'sample')
  fs.mkdirSync(project, { recursive: true })
  for (let i = 0; i < count; i += 1) fs.writeFileSync(path.join(project, `file-${i}.ts`), 'export {}\n')

  const { readyFileCatalog, resetFileCatalogs } = await import('./fileCatalog.ts')
  const { createPathVisibility, isPathVisible } = await import('./tree.ts')
  const snapshot = await readyFileCatalog('sample')
  for (const showAll of [true, false]) {
    const scalar = () => snapshot.files.filter(node => isPathVisible('sample', node.path, { showAll, type: node.type }))
    const batched = () => {
      const visible = createPathVisibility('sample', { showAll })
      return snapshot.files.filter(node => visible(node.path, node.type))
    }
    assert.deepEqual(batched(), scalar())
    const samples = { scalar: [] as number[], batched: [] as number[] }
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      for (const [name, run] of iteration % 2 === 0
        ? [['scalar', scalar], ['batched', batched]] as const
        : [['batched', batched], ['scalar', scalar]] as const) {
        const started = performance.now()
        assert.equal(run().length, count)
        samples[name].push(performance.now() - started)
      }
    }
    const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]
    const scalarMs = median(samples.scalar)
    const batchedMs = median(samples.batched)
    console.log(JSON.stringify({ scenario: 'warm catalog visibility', files: count, showAll, iterations, scalarMs, batchedMs, speedup: scalarMs / batchedMs }))
  }
  resetFileCatalogs()
} finally {
  process.loadEnvFile = originalLoadEnvFile
  fs.rmSync(temporary, { recursive: true, force: true })
}
