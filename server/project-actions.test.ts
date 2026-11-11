import './test-isolated-data.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ProjectActionsService, normalizeProjectActions } from './project-actions.ts'

function fixture(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-project-actions-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const write = (file: string, value: unknown) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), typeof value === 'string' ? value : JSON.stringify(value))
  }
  return { root, write }
}
const build = { id: 'build', name: 'Build', kind: 'build' as const, command: 'npm run build' }

async function finished(service: ProjectActionsService, root: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const run = service.state(root).runs[0]
    if (run?.status !== 'running') return run
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.fail('Action did not finish')
}

test('discovery uses explicit scripts and lockfiles without running or writing on read', t => {
  const { root, write } = fixture(t)
  write('package.json', { scripts: { build: 'vite build', 'build:debug': 'debug', 'build:release': 'release', deploy: 'ship', dev: 'server', test: 'tests' } })
  write('pnpm-lock.yaml', '')
  const service = new ProjectActionsService({ runner: async () => { assert.fail('Detection executed a command') } })
  const state = service.state(root)
  assert.deepEqual(state.actions.map(action => [action.id, action.command, action.variant]), [
    ['npm:build', 'pnpm run build', 'custom'], ['npm:build:debug', 'pnpm run build:debug', 'debug'],
    ['npm:build:release', 'pnpm run build:release', 'release'], ['npm:deploy', 'pnpm run deploy', undefined],
  ])
  assert.equal(state.needsAgent, false)
  assert.equal(fs.existsSync(path.join(root, '.mew/project-actions.json')), false)
  service.discover(root)
  const saved = JSON.parse(fs.readFileSync(path.join(root, '.mew/project-actions.json'), 'utf8'))
  assert.equal(saved.version, 1)
  assert.equal(saved.actions.length, 4)
})

test('saved edits and empty lists are authoritative; discovery never repairs malformed files silently', t => {
  const { root, write } = fixture(t)
  write('package.json', { scripts: { build: 'vite build', deploy: 'ship' } })
  const service = new ProjectActionsService()
  service.save(root, [{ ...build, id: 'npm:build', command: 'custom build', previewUrl: 'http://localhost:3000', artifacts: ['dist/*.zip'] }])
  const discovered = service.discover(root)
  assert.equal(discovered.actions.find(action => action.id === 'npm:build')?.command, 'custom build')
  assert.equal(discovered.actions.length, 2)
  service.save(root, [])
  assert.deepEqual(service.state(root).actions, [])
  write('.mew/project-actions.json', '{broken')
  const broken = service.discover(root)
  assert.equal(broken.needsAgent, true)
  assert.ok(broken.warnings.length)
  assert.equal(fs.readFileSync(path.join(root, '.mew/project-actions.json'), 'utf8'), '{broken')
  assert.throws(() => service.run(root, 'npm:build'), /찾을 수 없|설정/)
})

test('Android discovery requires a wrapper and Android plugin evidence; no deployment is invented', t => {
  const { root, write } = fixture(t)
  write('gradlew', '#!/bin/sh')
  write('build.gradle', 'plugins { id "java" }')
  const service = new ProjectActionsService()
  assert.equal(service.state(root).needsAgent, true)
  write('app/build.gradle.kts', 'plugins { id("com.android.application") }')
  const actions = service.state(root).actions
  assert.deepEqual(actions.map(action => [action.variant, action.command]), [['debug', './gradlew assembleDebug'], ['release', './gradlew assembleRelease']])
  assert.ok(actions.every(action => action.kind === 'build' && action.artifacts?.some(pattern => pattern.endsWith('*.apk'))))
})

test('runs are root scoped, reject duplicates, report actual failure and retain bounded output', async t => {
  const a = fixture(t), b = fixture(t)
  const pending: Array<{ command: string; root: string; output: (chunk: string) => void; resolve: (value: { exitCode: number | null }) => void }> = []
  const service = new ProjectActionsService({ runner: ({ command, root, onOutput }) => new Promise(resolve => pending.push({ command, root, output: onOutput, resolve })) })
  service.save(a.root, [build]); service.save(b.root, [{ ...build, command: 'other command' }])
  const first = service.run(a.root, build.id)
  assert.equal(first.status, 'running')
  assert.throws(() => service.run(a.root, build.id), /실행 중/)
  service.run(b.root, build.id)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(pending.map(run => [run.root, run.command]), [[a.root, build.command], [b.root, 'other command']])
  pending[0].output('x'.repeat(300_000)); pending[0].resolve({ exitCode: 9 })
  pending[1].resolve({ exitCode: 0 })
  assert.equal((await finished(service, a.root)).exitCode, 9)
  assert.equal(service.state(a.root).runs[0].status, 'failed')
  assert.ok(service.state(a.root).runs[0].output.length <= 131_072)
  assert.equal((await finished(service, b.root)).status, 'succeeded')
  assert.equal(service.state(a.root).runs.length, 1)
})

test('real shell runner records exit status and launch failures become failed runs', async t => {
  const { root } = fixture(t)
  const service = new ProjectActionsService()
  service.save(root, [{ ...build, command: `${JSON.stringify(process.execPath)} -e "process.stdout.write('completed'); process.exit(7)"` }])
  service.run(root, 'build')
  const run = await finished(service, root)
  assert.equal(run.status, 'failed'); assert.equal(run.exitCode, 7); assert.equal(run.output, 'completed')
  const failing = new ProjectActionsService({ runner: async () => { throw new Error('spawn unavailable') } })
  failing.save(root, [build]); failing.run(root, 'build')
  assert.match((await finished(failing, root)).output, /spawn unavailable/)
})

test('successful runs expose only recorded regular artifacts and reject secrets, traversal and symlink escape', async t => {
  const { root, write } = fixture(t), outside = fixture(t)
  write('dist/app.apk', 'apk'); write('dist/.env', 'secret'); write('dist/.env.local', 'secret')
  write('.mew/accounts.json', 'secret'); write('.git/config', 'private'); outside.write('escape.apk', 'outside')
  fs.symlinkSync(path.join(outside.root, 'escape.apk'), path.join(root, 'dist/escape.apk'))
  const service = new ProjectActionsService({ runner: async () => ({ exitCode: 0 }) })
  service.save(root, [{ ...build, artifacts: ['dist/**/*', '.mew/*', '.git/*'] }])
  const started = service.run(root, 'build')
  assert.throws(() => service.artifact(root, started.id, 'dist/app.apk'))
  const run = await finished(service, root)
  assert.deepEqual(run.artifacts, [{ path: 'dist/app.apk', name: 'app.apk' }])
  assert.equal(service.artifact(root, run.id, 'dist/app.apk'), path.join(root, 'dist/app.apk'))
  for (const invalid of ['../escape.apk', '/etc/passwd', 'dist/../dist/app.apk', 'dist/escape.apk', 'dist/.env', '.mew/accounts.json', 'dist/missing.apk']) {
    assert.throws(() => service.artifact(root, run.id, invalid), Error, invalid)
  }
  assert.throws(() => service.artifact(outside.root, run.id, 'dist/app.apk'))
  fs.unlinkSync(path.join(root, 'dist/app.apk'))
  fs.symlinkSync(path.join(outside.root, 'escape.apk'), path.join(root, 'dist/app.apk'))
  assert.throws(() => service.artifact(root, run.id, 'dist/app.apk'))
})

test('validation rejects duplicate IDs, invalid commands, unsafe preview protocols and escaping patterns', () => {
  for (const input of [null, [{ ...build, id: '../build' }], [build, build], [{ ...build, command: '' }], [{ ...build, kind: 'server' }], [{ ...build, previewUrl: 'javascript:alert(1)' }], [{ ...build, artifacts: ['../secret.apk'] }]]) {
    assert.throws(() => normalizeProjectActions(input))
  }
})

test('oversized saves are rejected before replacing the previous usable configuration', t => {
  const { root } = fixture(t)
  const service = new ProjectActionsService()
  service.save(root, [build])
  const original = fs.readFileSync(path.join(root, '.mew/project-actions.json'), 'utf8')
  const oversized = Array.from({ length: 50 }, (_, index) => ({ ...build, id: `build-${index}`, command: 'x'.repeat(4_000), artifacts: Array.from({ length: 20 }, (_, artifact) => `dist/${artifact}${'a'.repeat(450)}.apk`) }))
  assert.throws(() => service.save(root, oversized), /256KB/)
  assert.equal(fs.readFileSync(path.join(root, '.mew/project-actions.json'), 'utf8'), original)
  assert.equal(service.state(root).actions[0].id, build.id)
})

test('a long running action remains visible when it finishes after newer runs fill history', async t => {
  const { root } = fixture(t)
  let finishLong!: (value: { exitCode: number | null }) => void
  const service = new ProjectActionsService({ runner: input => input.command === 'long' ? new Promise(resolve => { finishLong = resolve }) : Promise.resolve({ exitCode: 0 }) })
  service.save(root, Array.from({ length: 23 }, (_, index) => ({ ...build, id: `action-${index}`, command: index === 0 ? 'long' : 'short' })))
  const long = service.run(root, 'action-0')
  for (let index = 1; index < 23; index++) { service.run(root, `action-${index}`); await new Promise(resolve => setImmediate(resolve)) }
  assert.equal(service.state(root).runs.find(run => run.id === long.id)?.status, 'running')
  finishLong({ exitCode: 0 }); await new Promise(resolve => setImmediate(resolve))
  assert.equal(service.state(root).runs.find(run => run.id === long.id)?.status, 'succeeded')
  assert.ok(service.state(root).runs.length <= 20)
})

test('symlinked configuration files and folders stay untouched and return recoverable warnings', t => {
  const project = fixture(t), outside = fixture(t)
  outside.write('settings.json', { version: 1, actions: [build] })
  fs.mkdirSync(path.join(project.root, '.mew'))
  fs.symlinkSync(path.join(outside.root, 'settings.json'), path.join(project.root, '.mew/project-actions.json'))
  const service = new ProjectActionsService()
  assert.equal(service.state(project.root).needsAgent, true)
  assert.throws(() => service.save(project.root, []))
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(outside.root, 'settings.json'), 'utf8')).actions, [build])
  fs.unlinkSync(path.join(project.root, '.mew/project-actions.json')); fs.rmdirSync(path.join(project.root, '.mew'))
  fs.symlinkSync(outside.root, path.join(project.root, '.mew'), 'dir')
  assert.equal(service.state(project.root).needsAgent, true)
  assert.throws(() => service.save(project.root, []))
  assert.equal(fs.existsSync(path.join(outside.root, 'project-actions.json')), false)
})
