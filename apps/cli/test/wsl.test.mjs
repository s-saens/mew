import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { wslContext, wslStartupDefinition, wslBrowserLaunch } from '../src/wsl.mjs'
import { registerAutoStart, unregisterAutoStart, startupDefinition } from '../src/startup.mjs'
import { openBrowser } from '../src/launcher.mjs'

const environment = { platform: 'linux', env: { WSL_DISTRO_NAME: "Ubuntu's daily distro" }, kernel: '6.6.87.2-microsoft-standard-WSL2', user: 'sam' }
const config = { nodePath: '/home/sam/node 24/bin/node', entry: '/home/sam/cli/bin/mew.mjs', options: { workspace: '/home/sam/$work/"quoted"/back\\slash/', dataDir: '/home/sam/.local/share/mew', cacheDir: '/home/sam/runtime', port: 5000, settingsFile: '/home/sam/private/settings.env', databaseUrl: 'postgres://secret-value@localhost/db' } }
const decode = args => Buffer.from(args.at(-1), 'base64').toString('utf16le')

test('WSL detection requires version 2 and a named distribution and account', () => {
  assert.deepEqual(wslContext(environment), { distro: "Ubuntu's daily distro", user: 'sam' })
  assert.equal(wslContext({ ...environment, kernel: '6.8.0-generic' }), null)
  assert.equal(wslContext({ ...environment, platform: 'darwin' }), null)
  assert.throws(() => wslContext({ ...environment, kernel: '4.4.0-19041-Microsoft' }), /WSL 2/)
  assert.throws(() => wslContext({ ...environment, env: {} }), /identify this WSL distribution/)
  assert.throws(() => wslContext({ ...environment, user: 'sam\nother' }), /identify/)
})

test('WSL login action retains fixed Linux paths and current distro without shell interpolation or secrets', () => {
  const definition = wslStartupDefinition(config, environment)
  assert.equal(definition.kind, 'wsl')
  assert.match(definition.name, /^Mew-WSL-[a-f0-9]{24}$/)
  const [command, args] = definition.registration[0]
  assert.equal(command, 'powershell.exe')
  const script = decode(args)
  assert.ok(script.includes('"--distribution" "Ubuntu\'\'s daily distro" "--user" "sam" "--exec" "/home/sam/node 24/bin/node"'))
  assert.ok(script.includes('"--service" "--workspace" "/home/sam/$work/\\"quoted\\"/back\\slash/"'))
  assert.ok(script.includes('"--settings" "/home/sam/private/settings.env"'))
  assert.match(script, /GetCurrent\(\)\.User\.Value/)
  assert.ok(script.includes(`$name = '${definition.name}' + '-' + $sid`))
  assert.match(script, /-LogonType Interactive -RunLevel Limited/)
  assert.match(script, /existing\.Description -ne \$marker/)
  assert.doesNotMatch(script, /secret-value|npx|systemctl|Start-ScheduledTask|--terminate|--shutdown|--unregister|-RunLevel Highest/)
  assert.equal(startupDefinition(config, environment).kind, 'wsl')
  assert.notEqual(definition.name, wslStartupDefinition(config, { ...environment, env: { WSL_DISTRO_NAME: 'Other distro' } }).name)
})

test('register and remove existing-WSL startup use injected Windows calls without changing Linux config or launching a task', async () => {
  const commands = [], run = async (...values) => { commands.push(values) }
  const registered = await registerAutoStart(config, { ...environment, run })
  const removed = await unregisterAutoStart(config, { ...environment, run })
  assert.equal(registered.name, removed.name)
  assert.equal(commands.length, 2)
  assert.match(decode(commands[0][1]), /Register-ScheduledTask/)
  const script = decode(commands[1][1])
  assert.match(script, /Unregister-ScheduledTask -TaskName \$name -Confirm:\$false/)
  assert.match(script, /existing\.Description -ne \$marker/)
  assert.doesNotMatch(script, /Register-ScheduledTask|Stop-ScheduledTask|--terminate|--shutdown/)
})

test('unavailable Windows interop fails clearly without exposing command arguments', async () => {
  const run = async () => { throw new Error('ENOENT or secret-value') }
  await assert.rejects(registerAutoStart(config, { ...environment, run }), error => /Enable Windows interop/.test(error.message) && !error.message.includes('secret-value'))
  await assert.rejects(unregisterAutoStart(config, { ...environment, run }), /could not remove Windows login startup/)
})

test('invalid task paths are rejected before Windows execution', () => {
  assert.throws(() => wslStartupDefinition({ ...config, entry: '/tmp/cli\nother' }, environment), /Invalid Mew WSL startup path/)
})

test('WSL browser bridge preserves a private setup fragment only in the direct process invocation', () => {
  const url = "http://localhost:5000/#setup=private-token&label='quoted'"
  const launch = wslBrowserLaunch(url, environment)
  assert.equal(launch.command, 'powershell.exe')
  assert.equal(decode(launch.args), "Start-Process 'http://localhost:5000/#setup=private-token&label=''quoted'''" )
  assert.doesNotMatch(decode(launch.args), /Out-File|Write-|Set-Content|Invoke-Expression/)
  assert.equal(wslBrowserLaunch(url, { ...environment, kernel: '6.8.0-generic' }), null)
  for (const value of ['javascript:alert(1)', 'https://example.com', 'http://user:password@localhost:5000']) assert.throws(() => wslBrowserLaunch(value, environment), /only its local browser address/)
})

test('browser opening chooses Windows from WSL and reports missing interop without leaking setup tokens', () => {
  const calls = [], warnings = []
  let child
  const spawnImpl = (...values) => { calls.push(values); child = new EventEmitter(); child.unref = () => {}; return child }
  openBrowser('http://127.0.0.1:5000/#setup=private-token', 'linux', { ...environment, spawnImpl, warn: value => warnings.push(value) })
  assert.equal(calls[0][0], 'powershell.exe')
  assert.equal(calls[0][2].stdio, 'ignore')
  child.emit('error', new Error('ENOENT'))
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /Enable Windows interop/)
  assert.ok(!warnings[0].includes('private-token'))
  child.emit('exit', 1)
  assert.equal(warnings.length, 1)
  openBrowser('http://127.0.0.1:5000/#setup=private-token', 'linux', { ...environment, spawnImpl, warn: value => warnings.push(value) })
  child.emit('exit', 1)
  assert.equal(warnings.length, 2)
  openBrowser('http://127.0.0.1:5000', 'linux', { ...environment, kernel: '6.8.0-generic', spawnImpl })
  assert.equal(calls[2][0], 'xdg-open')
})
