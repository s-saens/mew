import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { descriptionCatalog } from './document-descriptions.ts'

const root = fileURLToPath(new URL('..', import.meta.url))

test('agent search guidance does not bootstrap the retired Graphify experiment', () => {
  const agent = fs.readFileSync(path.join(root, '.mew/docs/AGENT.md'), 'utf8')
  const search = fs.readFileSync(path.join(root, 'docs/configuration/search.md'), 'utf8')
  assert.doesNotMatch(agent, /graphify/i)
  assert.doesNotMatch(search, /node tools\/graphify|graphifyy==|MEW_GRAPHIFY_TOKENIZER_PYTHON/)
  assert.match(search, /제거했다/)
  assert.match(agent, /document-descriptions\.ts/)
  for (const name of fs.readdirSync(path.join(root, 'tools'))) assert.doesNotMatch(name, /^graphify/)
})

test('retired evidence is retained without entering default document discovery', () => {
  const docs = path.join(root, '.mew/docs')
  const current = descriptionCatalog(docs)
  assert.equal(current.entries.some(([file]) => file.startsWith('history/graphify/')), false)
  const cases = JSON.parse(fs.readFileSync(path.join(docs, 'history/graphify/graphify-benchmark-cases.json'), 'utf8'))
  assert.equal(cases.length, 24)
  assert.ok(cases.every((task: { expectedFiles: string[]; evidence: string[] }) => task.expectedFiles.length && task.evidence.length))
  assert.ok(fs.existsSync(path.join(docs, 'research/graphify-search-benchmark.md')))
})
