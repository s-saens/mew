import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { bootstrapWindows, windowsInstallManifest } from '../src/windows-bootstrap.mjs'
import { prepareWindowsAssets, windowsAssets } from '../tools/prepare-windows-assets.mjs'

const digest = 'a'.repeat(64)
const sums = `${digest}  mew-runtime-linux-x64.tar.gz\n`
const downloads = { rootfs: { url: 'https://example.test/ubuntu', sha256: 'b'.repeat(64) }, node: { version: '24.21.0', url: 'https://example.test/node', sha256: 'c'.repeat(64) } }
const temporary = async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-windows-bootstrap-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  return directory
}

test('Windows manifest requires an unambiguous versioned Linux release and pinned prerequisites', () => {
  const manifest = windowsInstallManifest('1.2.3', sums, downloads)
  assert.equal(manifest.runtime.sha256, digest)
  assert.match(manifest.runtime.url, /mew-cli-v1\.2\.3\/mew-runtime-linux-x64\.tar\.gz$/)
  for (const text of ['', sums + sums]) assert.throws(() => windowsInstallManifest('1.2.3', text, downloads))
  assert.throws(() => windowsInstallManifest('latest', sums, downloads))
  assert.throws(() => windowsInstallManifest('1.2.3', sums, { ...downloads, node: { ...downloads.node, url: 'http://example.test/node' } }))
})

test('Windows setup stages durable files, prepares WSL, then detaches the owned controller without a shell', async t => {
  const root = await temporary(t), packageRoot = path.join(root, 'package'), env = { LOCALAPPDATA: path.join(root, 'local'), SystemRoot: 'C:\\Windows' }
  const assets = path.join(packageRoot, 'windows-assets')
  await fs.mkdir(assets, { recursive: true })
  for (const name of windowsAssets) await fs.writeFile(path.join(assets, name), name === 'downloads.json' ? JSON.stringify(downloads) : '# fixture\n')
  const staged = path.join(root, 'durable-cli')
  await fs.mkdir(staged); await fs.writeFile(path.join(staged, 'package.json'), '{}')
  const commands = []
  const deps = { platform: 'win32', arch: 'x64', env, fetchImpl: async url => { assert.match(url, /mew-cli-v1\.2\.3\/SHA256SUMS$/); return { ok: true, text: async () => sums } }, stage: async () => ({ directory: staged }), run: async (command, args, options) => { commands.push({ command, args, options }); return 0 } }
  const result = await bootstrapWindows({ version: '1.2.3', packageRoot, options: { action: 'start' } }, deps)
  assert.equal(result.rebootRequired, false)
  assert.equal(commands.length, 2)
  assert.equal(commands[0].args.at(-1), 'prepare')
  assert.equal(commands[1].args.at(-1), 'launch')
  assert.equal(commands[1].options.detached, true)
  assert.equal(JSON.parse(await fs.readFile(path.join(result.appRoot, 'install-manifest.json'), 'utf8')).runtime.sha256, digest)
  commands.length = 0
  const reboot = await bootstrapWindows({ version: '1.2.3', packageRoot, options: {} }, { ...deps, log() {}, run: async (...args) => { commands.push(args); return 3010 } })
  assert.equal(reboot.rebootRequired, true)
  assert.equal(commands.length, 1, 'reboot must not launch an incomplete environment')
  await assert.rejects(bootstrapWindows({ version: '1.2.3', packageRoot, options: {} }, { ...deps, run: async () => 1 }), /preparation failed/)
  await assert.rejects(bootstrapWindows({ version: '1.2.3', packageRoot, options: {} }, { ...deps, arch: 'arm64' }), /x64/)
})

test('npm payload generation copies shared installer sources, including reboot arguments and private stop control', async t => {
  const root = await temporary(t), source = path.join(root, 'apps/windows-installer')
  await fs.mkdir(source, { recursive: true })
  for (const name of windowsAssets) await fs.writeFile(path.join(source, name), name + '\n')
  const output = await prepareWindowsAssets({ root })
  for (const name of windowsAssets) assert.equal(await fs.readFile(path.join(output, name), 'utf8'), name + '\n')
  const actual = new URL('../../windows-installer/', import.meta.url)
  assert.match(await fs.readFile(new URL('installer-core.ps1', actual), 'utf8'), /ResumeArguments/)
  assert.match(await fs.readFile(new URL('launcher-core.ps1', actual), 'utf8'), /MEW_INSTALLER_STOPPED/)
  assert.match(await fs.readFile(new URL('npm-setup.ps1', actual), 'utf8'), /Register-ScheduledTask/)
})
