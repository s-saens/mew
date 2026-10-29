import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { descriptionCatalog, readDescription, repositoryDescriptionCatalog } from './document-descriptions.ts'

test('catalog reads YAML descriptions without body fields and excludes cold or linked trees', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-descriptions-'))
  try {
    for (const dir of ['history', 'archives', '.hidden', 'current']) fs.mkdirSync(path.join(root, dir))
    const raw = '---\r\ndescription: >-\r\n  PDF 필기와\r\n  저장 계약\r\n---\r\n본문 description: secret body\n'
    fs.writeFileSync(path.join(root, 'current/PDF.md'), raw)
    for (const dir of ['history', 'archives', '.hidden']) fs.writeFileSync(path.join(root, dir, 'old.md'), '---\ndescription: 이전 계약\n---\n')
    fs.symlinkSync(path.join(root, 'archives'), path.join(root, 'alias'))
    assert.deepEqual(descriptionCatalog(root), { entries: [['current/PDF.md', 'PDF 필기와 저장 계약']], errors: [] })
    assert.equal(descriptionCatalog(root, true).entries.length, 2)
    for (const header of ['description: ""', 'desc: old', 'description: [array]', 'description: one\ndescription: two']) {
      fs.writeFileSync(path.join(root, 'bad.md'), `---\n${header}\n---\ndescription: body\n`)
      assert.equal(descriptionCatalog(root).errors.length, 1)
    }
    fs.writeFileSync(path.join(root, 'bad.md'), '# No header\ndescription: body\n')
    assert.throws(() => readDescription(path.join(root, 'bad.md')), /Missing frontmatter/)
    const long = '설명'.repeat(2500)
    fs.writeFileSync(path.join(root, 'long.md'), `---\ndescription: ${long}\n---\n`)
    assert.equal(readDescription(path.join(root, 'long.md')), long, 'UTF-8 headers spanning chunks remain intact')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('repository checks cover project knowledge, tasks, public guides and first-party skills only', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-description-roots-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const documents = {
    '.mew/docs/current.md': 'Project contract',
    '.mew/docs/history/old.md': 'Historical contract',
    '.mew/tasks/Task.md': 'Task status',
    '.mew/notes/Note.md': 'Working note',
    'docs/guides/usage.md': 'User guide',
    'resources/skills/example/SKILL.md': 'Bundled skill',
    'resources/help/commands.md': 'In-app help',
  }
  for (const [file, description] of Object.entries(documents)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), `---\ndescription: ${description}\n---\n`)
  }
  for (const file of ['.mew/cache/private.md', '.mew/docs/archives/raw.md', 'resources/skills/.vendor/source/SKILL.md', 'resources/images/source.md']) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), '# Not maintained documentation\n')
  }
  fs.writeFileSync(path.join(root, '.mew/agent-context.json'), JSON.stringify({ version: 1, enabled: true, docsDir: '.mew/docs', entrypoints: [], instructions: '' }))
  assert.deepEqual(repositoryDescriptionCatalog(root).entries.map(([file]) => file).sort(), Object.keys(documents).filter(file => !file.includes('/history/')).sort())
  assert.equal(repositoryDescriptionCatalog(root, true).entries.length, 7)
  assert.deepEqual(repositoryDescriptionCatalog(root, true).errors, [])
  fs.writeFileSync(path.join(root, '.mew/tasks/Task.md'), '# Missing metadata\n')
  assert.deepEqual(repositoryDescriptionCatalog(root).errors, ['.mew/tasks/Task.md: Missing frontmatter'])
})

test('the CLI discovers configured knowledge by default and preserves explicit directory overrides', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-description-cli-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const directory of ['.mew/docs', 'docs']) fs.mkdirSync(path.join(root, directory), { recursive: true })
  fs.writeFileSync(path.join(root, '.mew/agent-context.json'), JSON.stringify({ version: 1, enabled: true, docsDir: '.mew/docs', entrypoints: [], instructions: '' }))
  fs.writeFileSync(path.join(root, '.mew/docs/contract.md'), '---\ndescription: Internal contract\n---\n')
  fs.writeFileSync(path.join(root, 'docs/guide.md'), '---\ndescription: Public guide\n---\n')
  const cli = fileURLToPath(new URL('./document-descriptions.ts', import.meta.url))
  const run = (...args: string[]) => execFileSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' })
  assert.equal(run(), '"contract.md"\tInternal contract\n')
  assert.equal(run('docs'), '"guide.md"\tPublic guide\n')
  assert.equal(run('--check', '--repository'), '2 descriptions, 0 errors\n')
})
