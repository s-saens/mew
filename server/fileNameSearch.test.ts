import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { rankFileNamePaths, searchFileNames } from './fileNameSearch.ts'
import { DEFAULT_PROJECT, projectRoot, setWorkspaceRoot, WORKSPACE_PROJECT, WORKSPACE_ROOT } from './paths.ts'
import { resetFileCatalogs } from './fileCatalog.ts'

test('파일명 ranking은 basename exact와 prefix를 깊은 경로보다 먼저 둔다', () => {
  const paths = ['src/deep/search-panel.test.ts', 'docs/search.md', 'search', 'src/SearchPanel.tsx']
  assert.deepEqual(rankFileNamePaths('search', paths, { caseSensitive: false }), [
    'search',
    'docs/search.md',
    'src/SearchPanel.tsx',
    'src/deep/search-panel.test.ts',
  ])
})

test('파일명 ranking은 한글·kebab subsequence와 대소문자를 지원한다', () => {
  assert.deepEqual(rankFileNamePaths('검계', ['문서/검색-계획.md', '문서/검색.md'], { caseSensitive: false }), ['문서/검색-계획.md'])
  assert.deepEqual(rankFileNamePaths('src/App*', ['src/app.ts', 'src/App.tsx'], { caseSensitive: true }), ['src/App.tsx'])
})

test('와일드카드는 확장자와 파일명 전체를 대조하며 정규식 문자를 리터럴로 취급한다', () => {
  const paths = ['bin/app.exe', 'app.EXE', 'bin/app.exe.bak', 'bin/exe.txt', 'setup.exe']
  assert.deepEqual(rankFileNamePaths('*.exe', paths, { caseSensitive: false }), ['app.EXE', 'bin/app.exe', 'setup.exe'])
  assert.deepEqual(rankFileNamePaths('*.exe', paths, { caseSensitive: true }), ['bin/app.exe', 'setup.exe'])
  assert.deepEqual(rankFileNamePaths('app*.exe', paths, { caseSensitive: false }), ['app.EXE', 'bin/app.exe'])
  assert.deepEqual(rankFileNamePaths('file?.txt', ['dir/file1.txt', 'file12.txt', 'file.txt', 'file😀.txt'], { caseSensitive: false }), ['dir/file1.txt', 'file😀.txt'])
  assert.deepEqual(rankFileNamePaths('a[1]*.txt', ['dir/a[1](x).txt', 'a1.txt'], { caseSensitive: false }), ['dir/a[1](x).txt'])
})

test('와일드카드는 경로·연속 별표·빈 매치·결과 상한을 지원한다', () => {
  const paths = ['src/App.tsx', 'src/deep/App.test.tsx', 'docs/App.tsx', 'src/App.tsx.bak']
  assert.deepEqual(rankFileNamePaths('src/**.tsx', paths, { caseSensitive: false }), ['src/App.tsx', 'src/deep/App.test.tsx'])
  assert.deepEqual(rankFileNamePaths('a*b?c*.txt', ['abXc.txt', 'aabYc-more.txt', 'abc.txt'], { caseSensitive: false }), ['aabYc-more.txt', 'abXc.txt'])
  assert.equal(rankFileNamePaths('*', paths, { caseSensitive: false }, 2).length, 2)
  assert.deepEqual(rankFileNamePaths('', paths, { caseSensitive: false }), [])
})


test('파일명 정규식 옵션은 기본 와일드카드·퍼지보다 우선한다', () => {
  const paths = ['src/App.tsx', 'src/App.test.tsx', 'docs/app.md', 'file😀.txt']
  assert.deepEqual(rankFileNamePaths('^App\\.tsx$', paths, { regex: true, caseSensitive: true }), ['src/App.tsx'])
  assert.deepEqual(rankFileNamePaths('^app', paths, { regex: true, caseSensitive: false }), ['docs/app.md', 'src/App.test.tsx', 'src/App.tsx'])
  assert.deepEqual(rankFileNamePaths('^src/.*test', paths, { regex: true, caseSensitive: false }), ['src/App.test.tsx'])
  assert.deepEqual(rankFileNamePaths('*.tsx', paths, { regex: false, caseSensitive: false }), ['src/App.test.tsx', 'src/App.tsx'])
  assert.throws(() => rankFileNamePaths('(', paths, { regex: true, caseSensitive: false }), SyntaxError)
  assert.throws(() => rankFileNamePaths('App(?=\\.tsx)', paths, { regex: true, caseSensitive: false }), SyntaxError)
  assert.throws(() => rankFileNamePaths('(App)\\1', paths, { regex: true, caseSensitive: false }), SyntaxError)
})

test('파일명 root 범위는 Documents 중복을 상한 전에 제외하고 하위 프로젝트·권한을 유지한다', async () => {
  const original = WORKSPACE_ROOT
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mew-filename-scope-')))
  setWorkspaceRoot(root)
  try {
    fs.mkdirSync(path.join(root, 'app', '.mew'), { recursive: true })
    fs.writeFileSync(path.join(root, 'app', 'z-scope-child.md'), 'child\n')
    fs.writeFileSync(path.join(root, 'b-scope-root.md'), 'root\n')
    for (let index = 0; index < 55; index++) {
      fs.writeFileSync(path.join(projectRoot(DEFAULT_PROJECT), `a-scope-${String(index).padStart(2, '0')}.md`), 'document\n')
    }
    const options = { caseSensitive: false, showAll: true }
    const unified = await searchFileNames('*scope*.md', { ...options, scopes: [] })
    assert.equal(unified.results.length, 50)
    assert.ok(unified.results.every(row => row.project === DEFAULT_PROJECT), '별도 Documents 결과가 통합 검색의 앞 50개를 채운다')

    const workspace = await searchFileNames('*scope*.md', { ...options, scopes: ['root'] })
    assert.equal(workspace.results.length, 50)
    assert.ok(workspace.results.every(row => row.project === WORKSPACE_PROJECT))
    assert.ok(workspace.results.some(row => row.path === 'b-scope-root.md'), 'Documents 결과를 거른 뒤 상한을 적용한다')
    assert.ok(workspace.results.some(row => row.path === 'app/z-scope-child.md'), 'root는 하위 프로젝트 내부도 포함한다')

    const docs = await searchFileNames('*scope*.md', { ...options, scopes: ['docs'] })
    assert.equal(docs.results.length, 50)
    assert.ok(docs.results.every(row => row.project === DEFAULT_PROJECT))
    const child = await searchFileNames('*scope*.md', { ...options, scopes: ['subproject:app'] })
    assert.deepEqual(child.results.map(row => [row.project, row.path]), [[WORKSPACE_PROJECT, 'app/z-scope-child.md']])

    const allowed = await searchFileNames('*scope*.md', {
      ...options, scopes: ['root'], allowed: (project, relPath) => project === WORKSPACE_PROJECT && relPath === 'b-scope-root.md',
    })
    assert.deepEqual(allowed.results.map(row => [row.project, row.path]), [[WORKSPACE_PROJECT, 'b-scope-root.md']])
  } finally {
    resetFileCatalogs()
    setWorkspaceRoot(original)
    fs.rmSync(root, { recursive: true, force: true })
  }
})
