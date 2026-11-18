import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { stagePersistentCli, startupDefinition, registerAutoStart, unregisterAutoStart } from '../src/startup.mjs'

const temporary = async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-startup-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  return directory
}

test('persistent staging keeps launcher dependencies runnable after the original npx cache is removed', async t => {
  const root = await temporary(t), packageRoot = path.join(root, 'npx-cache', 'mew-ide'), dataDir = path.join(root, 'private-data')
  await fs.mkdir(path.join(packageRoot, 'bin'), { recursive: true })
  await fs.mkdir(path.join(packageRoot, 'src'))
  await fs.mkdir(path.join(packageRoot, 'node_modules', 'fixture-dependency'), { recursive: true })
  await fs.writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'mew-ide', type: 'module', dependencies: { 'fixture-dependency': '1.0.0' } }))
  await fs.writeFile(path.join(packageRoot, 'bin', 'mew.mjs'), "import value from '../src/main.mjs'; console.log(value)\n")
  await fs.writeFile(path.join(packageRoot, 'src', 'main.mjs'), "import value from 'fixture-dependency'; export default value\n")
  await fs.writeFile(path.join(packageRoot, 'node_modules', 'fixture-dependency', 'package.json'), JSON.stringify({ name: 'fixture-dependency', version: '1.0.0', main: 'index.js' }))
  await fs.writeFile(path.join(packageRoot, 'node_modules', 'fixture-dependency', 'index.js'), "module.exports = 'persistent launcher works'\n")
  const staged = await stagePersistentCli({ packageRoot, dataDir, version: '1.2.3' })
  assert.ok(!staged.directory.startsWith(dataDir + path.sep))
  await fs.writeFile(path.join(staged.directory, 'src', 'main.mjs'), '')
  await stagePersistentCli({ packageRoot, dataDir, version: '1.2.3' })
  await fs.rm(path.join(root, 'npx-cache'), { recursive: true })
  const result = await promisify(execFile)(process.execPath, [staged.entry])
  assert.equal(result.stdout.trim(), 'persistent launcher works')
  assert.equal((await stagePersistentCli({ packageRoot, dataDir, version: '1.2.3' })).entry, staged.entry)
})

test('login registration uses fixed version paths, private settings, safe quoting, and never starts the app', async t => {
  const root = await temporary(t), commands = []
  const config = { entry: path.join(root, 'fixed', 'mew.mjs'), nodePath: '/node path/node', options: { workspace: '/projects/50% "review"', dataDir: path.join(root, 'data'), cacheDir: path.join(root, 'runtimes'), port: 5000, settingsFile: '/private/settings.env' } }
  const linux = await registerAutoStart(config, { platform: 'linux', kernel: '6.8.0', env: { XDG_CONFIG_HOME: root }, run: async (...args) => commands.push(args) })
  const body = await fs.readFile(linux.path, 'utf8')
  assert.ok(body.includes('--service') && body.includes('/private/settings.env'))
  assert.ok(body.includes('50%% \\"review\\"'))
  assert.ok(!body.includes('npx') && !body.includes('--port'))
  assert.deepEqual(commands.map(([command, args]) => [command, ...args]), [['systemctl', '--user', 'daemon-reload'], ['systemctl', '--user', 'enable', linux.name]])
  await unregisterAutoStart(config, { platform: 'linux', kernel: '6.8.0', env: { XDG_CONFIG_HOME: root }, run: async (...args) => commands.push(args) })
  await assert.rejects(fs.access(linux.path))
  assert.ok(!commands.some(([, args]) => args.includes('start') || args.includes('stop')))
  const mac = startupDefinition({ ...config, options: { ...config.options, workspace: '/projects/A&B <review>', port: 5010, portExplicit: true } }, { platform: 'darwin', home: root })
  assert.match(mac.body, /A&amp;B &lt;review&gt;/)
  assert.ok(mac.body.includes('<string>5010</string>'))
  assert.deepEqual(mac.registration, [])
  assert.throws(() => startupDefinition(config, { platform: 'freebsd' }), /Automatic Mew startup/)
})

test('staging rejects escaping release identities before creating files', async t => {
  const root = await temporary(t)
  await assert.rejects(stagePersistentCli({ packageRoot: root, dataDir: path.join(root, 'data'), version: '../other' }), /Invalid/)
})

test('the real CLI dependency closure can load after staging outside npm storage', async t => {
  const root = await temporary(t), packageRoot = path.resolve(import.meta.dirname, '..')
  const metadata = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'))
  const alias = path.join(root, 'alias')
  await fs.symlink(root, alias, process.platform === 'win32' ? 'junction' : 'dir')
  const staged = await stagePersistentCli({ packageRoot, dataDir: path.join(alias, 'accounts'), version: metadata.version })
  const require = createRequire(path.join(staged.directory, 'package.json'))
  for (const name of ['qrcode-terminal', 'tar']) {
    const owner = await fs.realpath(path.join(staged.directory, 'node_modules', name))
    const entry = await fs.realpath(require.resolve(name))
    const relative = path.relative(owner, entry)
    assert.ok(relative && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep), entry)
  }
  const launcher = await import(pathToFileURL(path.join(staged.directory, 'src/launcher.mjs')).href)
  assert.equal(typeof launcher.launch, 'function')
})
