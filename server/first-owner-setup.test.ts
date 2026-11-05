import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import http from 'node:http'
import express from 'express'
import { remotePath } from '../shared/remote-access.ts'

test('first administrator setup preserves the local claim and account-store boundaries', { timeout: 30_000 }, async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mew-first-owner-'))
  const directory = path.join(temporary, 'data')
  process.env.MEW_DATA_DIR = directory
  const setup = await import('./first-owner-setup.ts')
  const storage = await import('./account-storage.ts')
  const auth = await import('./auth.ts')
  const { createAuthRouter, checkOrigin } = await import('./authRoutes.ts')
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const reset = () => { fs.rmSync(directory, { recursive: true, force: true }); fs.mkdirSync(directory) }
  const password = 'my-local-administrator-password'

  await t.test('only an explicit local operation arms fresh data and stores a token hash', () => {
    reset()
    assert.equal(setup.firstOwnerSetupRequired(), false)
    const first = setup.prepareFirstOwnerSetup('/fixture/workspace')
    assert.equal(first.setupRequired, true)
    assert.match(first.token!, /^[A-Za-z0-9_-]{43}$/)
    assert.equal(fs.readFileSync(storage.OWNER_SETUP_FILE, 'utf8').includes(first.token!), false)
    const second = setup.prepareFirstOwnerSetup('/fixture/workspace')
    assert.notEqual(second.token, first.token)
    assert.throws(() => setup.createFirstOwner({ email: 'owner@example.test', password, token: first.token }), { status: 403 })
    assert.equal(setup.firstOwnerSetupRequired(), true)
    assert.equal(auth.listUsers().length, 0)
  })

  await t.test('validation and bad claims leave pending setup usable; successful claim closes permanently', () => {
    reset()
    const { token } = setup.prepareFirstOwnerSetup('/fixture/workspace')
    for (const input of [{ email: 'bad', password }, { email: 'owner@example.test', password: 'short' }, { email: 'owner@example.test', password: 'owner@example.test' }, { email: 'owner@example.test', password, displayName: '\n' }]) {
      assert.throws(() => setup.createFirstOwner({ ...input, token }), { status: 400 })
    }
    assert.throws(() => setup.createFirstOwner({ email: 'owner@example.test', password, token: 'wrong' }), { status: 403 })
    assert.deepEqual(setup.createFirstOwner({ email: ' Owner@Example.Test ', password, token }), { email: 'owner@example.test', workspace: '/fixture/workspace' })
    const user = auth.getUser('owner@example.test')!
    assert.equal(user.role, 'owner')
    assert.equal(user.mustChangePassword, false)
    assert.equal(auth.verifyPassword(password, user.hash), true)
    assert.equal(fs.readFileSync(path.join(directory, 'users.json'), 'utf8').includes(password), false)
    assert.equal(setup.firstOwnerSetupRequired(), false)
    assert.throws(() => setup.createFirstOwner({ email: 'second@example.test', password, token }), { status: 409 })
    fs.unlinkSync(path.join(directory, 'users.json'))
    assert.deepEqual(setup.prepareFirstOwnerSetup(), { setupRequired: false })
    assert.equal(setup.firstOwnerSetupRequired(), false)
  })

  await t.test('existing, empty, corrupted and deleted account stores never silently reopen', () => {
    for (const content of ['{"version":2,"accounts":{},"passwordCredentials":{},"mewlinkIdentities":{},"mewlinkRequests":{}}', '{broken']) {
      reset()
      fs.writeFileSync(path.join(directory, 'users.json'), content)
      if (content === '{broken') assert.throws(() => setup.prepareFirstOwnerSetup())
      else assert.deepEqual(setup.prepareFirstOwnerSetup(), { setupRequired: false })
    }
    reset()
    fs.writeFileSync(path.join(directory, 'sessions.json'), '{}')
    assert.deepEqual(setup.prepareFirstOwnerSetup(), { setupRequired: false })
    reset()
    auth.upsertUser('existing@example.test', { hash: auth.hashPassword(password), role: 'member', mustChangePassword: false, createdAt: 1, passwordChangedAt: 1 })
    fs.unlinkSync(path.join(directory, 'users.json'))
    assert.deepEqual(setup.prepareFirstOwnerSetup(), { setupRequired: false })
    reset()
    fs.writeFileSync(path.join(directory, 'users.json'), JSON.stringify({ version: 1, users: {
      'legacy@example.test': { hash: 'legacy-hash', role: 'owner', mustChangePassword: true, createdAt: 1, passwordChangedAt: 1 },
    } }))
    assert.equal(auth.getUser('legacy@example.test')?.role, 'owner')
    fs.unlinkSync(path.join(directory, 'users.json'))
    assert.deepEqual(setup.prepareFirstOwnerSetup(), { setupRequired: false })
  })

  await t.test('an interrupted first account write leaves enrollment closed for local recovery', st => {
    reset()
    const { token } = setup.prepareFirstOwnerSetup(), rename = fs.renameSync
    st.mock.method(fs, 'renameSync', (source: fs.PathLike, destination: fs.PathLike) => {
      if (String(destination) === path.join(directory, 'users.json')) throw new Error('fixture interrupted account write')
      return rename(source, destination)
    })
    assert.throws(() => setup.createFirstOwner({ email: 'owner@example.test', password, token }), /fixture interrupted/)
    assert.equal(setup.firstOwnerSetupRequired(), false)
    assert.deepEqual(setup.prepareFirstOwnerSetup(), { setupRequired: false })
    assert.equal(auth.listUsers().length, 0)
  })

  await t.test('expired tokens and an occupied account transaction fail without creating users', () => {
    reset()
    const { token } = setup.prepareFirstOwnerSetup()
    const state = storage.readOwnerSetupState()!
    assert.equal(state.state, 'pending')
    if (state.state === 'pending') storage.writeOwnerSetupState({ ...state, expiresAt: 0 })
    assert.throws(() => setup.createFirstOwner({ email: 'owner@example.test', password, token }), { status: 403 })
    fs.writeFileSync(path.join(directory, 'accounts.lock'), JSON.stringify({ pid: process.pid, token: 'another-operation' }))
    assert.throws(() => setup.createFirstOwner({ email: 'owner@example.test', password, token }), storage.AccountStorageBusyError)
    fs.unlinkSync(path.join(directory, 'accounts.lock'))
    assert.equal(auth.listUsers().length, 0)
  })

  await t.test('account lock cleanup preserves mutation errors and never unlinks another owner', () => {
    reset()
    const expected = new Error('original mutation failure'), file = path.join(directory, 'accounts.lock')
    assert.throws(() => storage.withAccountStorageLock(() => { fs.writeFileSync(file, '{interrupted'); throw expected }), error => error === expected)
    assert.equal(fs.readFileSync(file, 'utf8'), '{interrupted')
    fs.unlinkSync(file)
    storage.withAccountStorageLock(() => { fs.writeFileSync(file, JSON.stringify({ pid: process.pid, token: 'replacement' })) })
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).token, 'replacement')
    fs.unlinkSync(file)
    fs.writeFileSync(file, JSON.stringify({ pid: 99_999_999, token: 'dead-owner' }))
    storage.withAccountStorageLock(() => {})
    assert.equal(fs.existsSync(file), false)
    fs.writeFileSync(file, JSON.stringify({ pid: 99_999_999, token: 'dead-owner' }))
    fs.writeFileSync(`${file}.recovery`, JSON.stringify({ pid: 99_999_999, token: 'interrupted-guard' }))
    assert.throws(() => storage.withAccountStorageLock(() => {}), /accounts.lock.recovery/)
  })

  await t.test('independent account processes cannot both claim the first owner', async () => {
    reset()
    const { token } = setup.prepareFirstOwnerSetup()
    const moduleUrl = pathToFileURL(path.resolve('server/first-owner-setup.ts')).href
    const race = (email: string) => new Promise<string>((resolve, reject) => {
      const code = `import {createFirstOwner} from ${JSON.stringify(moduleUrl)}; try { createFirstOwner(JSON.parse(process.argv[1])); process.stdout.write('created') } catch(e) { process.stdout.write(String(e.status ?? e.constructor.name)) }`
      const child = spawn(process.execPath, ['--input-type=module', '-e', code, JSON.stringify({ email, password, token })], { env: { ...process.env, MEW_DATA_DIR: directory }, stdio: ['ignore', 'pipe', 'pipe'] })
      let output = '', error = ''
      child.stdout.on('data', bytes => { output += bytes })
      child.stderr.on('data', bytes => { error += bytes })
      child.once('error', reject)
      child.once('exit', code => code === 0 ? resolve(output) : reject(new Error(error)))
    })
    const results = await Promise.all([race('one@example.test'), race('two@example.test')])
    assert.equal(results.filter(value => value === 'created').length, 1)
    assert.ok(results.every(value => ['created', '409', 'AccountStorageBusyError'].includes(value)))
    assert.equal(auth.listUsers().length, 1)
  })

  await t.test('HTTP advertises only pending setup and issues the ordinary owner session', async st => {
    reset()
    const { token } = setup.prepareFirstOwnerSetup('/fixture/current-workspace')
    const workspaces: string[][] = [], app = express()
    app.use(checkOrigin)
    app.use('/api/auth', createAuthRouter({ prepareFirstOwnerWorkspace: async (email, workspace) => { workspaces.push([email, workspace]) } }))
    const server = http.createServer(app)
    await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve) })
    st.after(() => { server.closeAllConnections(); server.close() })
    const address = server.address() as { port: number }, origin = `http://127.0.0.1:${address.port}`
    const status = await fetch(`${origin}/api/auth/me`)
    const initial = await status.json() as { setupRequired: boolean }
    assert.equal(initial.setupRequired, true)
    assert.equal(JSON.stringify(initial).includes(token!), false)
    const post = (body: unknown, requestOrigin = origin) => fetch(`${origin}/api/auth/setup`, { method: 'POST', headers: { origin: requestOrigin, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    assert.equal((await post({ email: 'owner@example.test', password, token }, 'https://other.example')).status, 403)
    assert.equal((await post({ email: 'owner@example.test', password, token: 'wrong' })).status, 403)
    const result = await post({ email: 'owner@example.test', password, token })
    assert.equal(result.status, 201)
    assert.equal(result.headers.get('cache-control'), 'no-store')
    const cookie = result.headers.get('set-cookie')!.split(';')[0]
    assert.match(cookie, /^mew_session=/)
    const owner = await result.json() as { authenticated: boolean; role: string; setupRequired: boolean; mustChangePassword: boolean }
    assert.equal(owner.authenticated, true)
    assert.equal(owner.role, 'owner')
    assert.equal(owner.setupRequired, false)
    assert.equal(owner.mustChangePassword, false)
    assert.deepEqual(workspaces, [['owner@example.test', '/fixture/current-workspace']])
    const current = await (await fetch(`${origin}/api/auth/me`, { headers: { cookie } })).json() as { email: string }
    assert.equal(current.email, 'owner@example.test')
    assert.equal((await post({ email: 'second@example.test', password, token })).status, 409)
    assert.equal(auth.listUsers().length, 1)
  })

  await t.test('setup invalid-claim failures use the existing bounded login throttle', async st => {
    reset()
    setup.prepareFirstOwnerSetup()
    const app = express()
    app.use('/api/auth', createAuthRouter())
    const server = http.createServer(app)
    await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve) })
    st.after(() => { server.closeAllConnections(); server.close() })
    const address = server.address() as { port: number }
    for (let attempt = 0; attempt < 11; attempt++) {
      const result = await fetch(`http://127.0.0.1:${address.port}/api/auth/setup`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.170' }, body: JSON.stringify({ email: 'throttle@example.test', password, token: 'wrong' }) })
      assert.equal(result.status, attempt < 10 ? 403 : 429)
    }
    assert.equal(auth.listUsers().length, 0)
  })

  await t.test('P2P bootstrap stays inaccessible even with the valid local claim token', async st => {
    reset()
    const { token } = setup.prepareFirstOwnerSetup(), { bindRemoteSocket } = await import('./remote-access-context.ts')
    assert.equal(remotePath('/api/auth/setup'), false)
    const app = express()
    app.use((req, _res, next) => { bindRemoteSocket(req.socket, { current: () => null }); next() })
    app.use('/api/auth', createAuthRouter())
    const server = http.createServer(app)
    await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve) })
    st.after(() => { server.closeAllConnections(); server.close() })
    const address = server.address() as { port: number }, origin = `http://127.0.0.1:${address.port}`
    const status = await (await fetch(`${origin}/api/auth/me`)).json() as { setupRequired: boolean }
    assert.equal(status.setupRequired, false)
    assert.equal((await fetch(`${origin}/api/auth/setup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.test', password, token }) })).status, 403)
    assert.equal(auth.listUsers().length, 0)
  })

  await t.test('the source setup CLI exposes a claim only for its explicit local JSON request', async () => {
    reset()
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [path.resolve('server/usersCli.ts'), 'setup', '--json'], {
        env: { ...process.env, MEW_DATA_DIR: directory, MEW_WORKSPACE: '/fixture/source-workspace' }, stdio: ['ignore', 'pipe', 'pipe'],
      })
      let result = '', error = ''
      child.stdout.on('data', bytes => { result += bytes })
      child.stderr.on('data', bytes => { error += bytes })
      child.once('error', reject)
      child.once('exit', code => code === 0 ? resolve(result) : reject(new Error(error)))
    })
    const parsed = JSON.parse(output) as { setupRequired: boolean; token: string }
    assert.equal(parsed.setupRequired, true)
    assert.match(parsed.token, /^[A-Za-z0-9_-]{43}$/)
    assert.equal(output.trim().split('\n').length, 1)
    assert.equal(auth.listUsers().length, 0)
    assert.equal(fs.readFileSync(storage.OWNER_SETUP_FILE, 'utf8').includes(parsed.token), false)
  })
})
