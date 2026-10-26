import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { type TestContext } from 'node:test'
import { createDemoRepositoryFixture } from './demo-repository-fixture.mjs'

const root = path.resolve(import.meta.dirname, '..')

function repository(t: TestContext) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-demo-repository-fixture-'))
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }))
  const directory = path.join(scratch, 'repository'), config = path.join(scratch, 'gitconfig'), hooks = path.join(scratch, 'hooks')
  fs.mkdirSync(directory)
  fs.mkdirSync(hooks)
  fs.writeFileSync(config, '')
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: config }
  const git = (args: string[]) => execFileSync('git', ['-c', `core.hooksPath=${hooks}`, ...args], { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] })
  git(['init', '--quiet', '--initial-branch=main'])
  return { directory, git }
}

test('an available regenerated revision uses the original Git source without fixed snapshot files', async t => {
  const { directory, git } = repository(t)
  const content = 'Committed future demo fixture.\n'
  fs.writeFileSync(path.join(directory, 'README.md'), content)
  git(['add', 'README.md'])
  git(['-c', 'user.name=Demo fixture', '-c', 'user.email=demo@example.test', '-c', 'commit.gpgSign=false',
    'commit', '--quiet', '-m', 'Fixture snapshot'])
  const index = { format: 'mew-demo-snapshot/v2', revision: git(['rev-parse', 'HEAD']).toString().trim(), files: {
    'README.md': { oid: createHash('sha256').update(JSON.stringify({ content })).digest('hex'), size: Buffer.byteLength(content), binary: false },
  } }
  assert.notEqual(index.revision, 'a7bae991ce8f077af8504beacade86491ba4dc1d')
  fs.writeFileSync(path.join(directory, 'README.md'), 'Uncommitted replacement.\n')
  const source = await createDemoRepositoryFixture(index, directory)
  assert.equal(JSON.parse(source.load(index.files['README.md'].oid)).content, 'Committed future demo fixture.\n')
  assert.equal(fs.existsSync(path.join(directory, 'src/demo/repository-index.json')), false)
})

test('a missing fixed Git commit and published object set fail explicitly without a network fallback', async t => {
  const { directory } = repository(t)
  const demo = path.join(directory, 'src/demo')
  fs.mkdirSync(demo, { recursive: true })
  for (const filename of ['repository-index.json', 'repository-snapshot.json']) {
    fs.copyFileSync(path.join(root, 'src/demo', filename), path.join(demo, filename))
  }
  const index = JSON.parse(fs.readFileSync(path.join(demo, 'repository-index.json'), 'utf8'))
  await assert.rejects(createDemoRepositoryFixture(index, directory),
    /Fixed demo Git commit and verified published object set are both unavailable; no network fetch is permitted/)
})
