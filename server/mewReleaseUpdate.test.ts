import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { latestMewRelease, packagedMewInstall, packagedMewUpdate } from './mewReleaseUpdate.ts'

const cliAssets = ['install.sh', 'SHA256SUMS', 'mew-cli-standalone.tar.gz', 'mew-runtime-linux-arm64.tar.gz']
const termuxAssets = ['install-termux.sh', 'mew-source.tar.gz']
const windowsAssets = ['mew-windows-setup-x64.exe', 'mew-windows-setup-x64.exe.sha256']

const release = (tag: string, assets: string[], options = {}) => ({
  tag_name: tag, draft: false, prerelease: false,
  assets: assets.map(name => ({ name, state: 'uploaded' })),
  ...options,
})

test('the application root identifies source installs, CLI launchers, and Termux archives without consulting Git', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-install-channel-'))
  t.after(() => fs.rm(root, { force: true, recursive: true }))

  assert.equal(packagedMewInstall(root, {}), null)
  for (const channel of ['curl', 'npm', 'windows']) {
    assert.deepEqual(packagedMewInstall(root, {
      MEW_DISTRIBUTION: 'release', MEW_INSTALL_CHANNEL: channel, MEW_INSTALL_VERSION: '0.2.1',
    }), { channel, version: '0.2.1' })
  }
  assert.deepEqual(packagedMewInstall(root, { MEW_DISTRIBUTION: 'release' }), { channel: 'unknown', version: null })

  await fs.writeFile(path.join(root, '.mew-termux-source'), 'source commit\n')
  assert.deepEqual(packagedMewInstall(root, {}), { channel: 'termux', version: null })
  await fs.writeFile(path.join(root, '.mew-install-version'), '0.2.2\n')
  assert.deepEqual(packagedMewInstall(root, {}), { channel: 'termux', version: '0.2.2' })

  await fs.rm(path.join(root, '.mew-termux-source'))
  await fs.writeFile(path.join(root, 'mew-runtime.json'), '{}')
  assert.deepEqual(packagedMewInstall(root, {}), { channel: 'unknown', version: null })
})

test('GitHub checks only discover complete releases for their channel and platform', async () => {
  const responses = [
    release('mew-cli-v0.9.0', cliAssets),
    release('mew-cli-v0.10.0', cliAssets),
    release('mew-cli-v0.11.0', cliAssets.slice(0, -1)),
    release('mew-cli-v0.12.0', cliAssets, { draft: true }),
    release('mew-cli-v0.13.0', cliAssets, { prerelease: true }),
    release('mew-cli-v0.14.0', cliAssets, {
      assets: cliAssets.map(name => ({ name, state: 'new' })),
    }),
    release('mew-cli-v0.15.0', [...cliAssets.slice(0, -1), 'mew-runtime-darwin-arm64.tar.gz']),
    release('mew-windows-v0.8.0', windowsAssets),
    release('mew-windows-v0.9.0', windowsAssets.slice(0, -1)),
    release('mew-termux-v0.7.0', termuxAssets, { prerelease: true }),
    release('mew-termux-v0.8.0', termuxAssets.slice(0, -1), { prerelease: true }),
  ]
  const fetchRelease = async () => Response.json(responses)
  assert.equal(await latestMewRelease('curl', { fetchRelease, platform: 'linux', arch: 'arm64' }), '0.10.0')
  assert.equal(await latestMewRelease('curl', { fetchRelease, platform: 'darwin', arch: 'arm64' }), '0.15.0')
  assert.equal(await latestMewRelease('windows', { fetchRelease }), '0.8.0')
  assert.equal(await latestMewRelease('termux', { fetchRelease }), '0.7.0')
  await assert.rejects(() => latestMewRelease('curl', { fetchRelease, platform: 'linux', arch: 'x64' }), /최신 배포 버전/)
})

test('release lookup follows pagination and stops on the final page', async () => {
  const pages: string[] = []
  const fetchRelease = async (url: string | URL | Request) => {
    const page = new URL(String(url)).searchParams.get('page')!
    pages.push(page)
    return page === '1'
      ? Response.json([], { headers: { link: '<https://example.test/>; rel="next"' } })
      : Response.json([release('mew-termux-v0.2.0', termuxAssets)])
  }
  assert.equal(await latestMewRelease('termux', { fetchRelease }), '0.2.0')
  assert.deepEqual(pages, ['1', '2'])
})

test('npm compares the installed version to the registry and recovers from failed refreshes', async t => {
  let version = '0.11.0'
  let failed = false
  const request = t.mock.method(globalThis, 'fetch', async (url: string) => {
    assert.equal(url, 'https://registry.npmjs.org/mew-ide/latest')
    return failed ? new Response(null, { status: 404 }) : Response.json({ version })
  })
  const install = { channel: 'npm', version: '0.10.0' } as const
  const [first, concurrent] = await Promise.all([packagedMewUpdate(install, true), packagedMewUpdate(install, true)])
  assert.deepEqual(first, concurrent)
  assert.equal(first.currentVersion, '0.10.0')
  assert.equal(first.latestVersion, '0.11.0')
  assert.equal(first.available, true)
  assert.equal(first.error, null)
  assert.match(first.updateInstruction!, /npx mew-ide@latest/)
  assert.equal(first.updateUrl, null)
  assert.deepEqual(await packagedMewUpdate(install, false), first)
  assert.equal(request.mock.callCount(), 1)

  failed = true
  const unavailable = await packagedMewUpdate(install, true)
  assert.equal(unavailable.available, false)
  assert.equal(unavailable.latestVersion, null)
  assert.match(unavailable.error!, /404/)
  failed = false
  version = '0.9.0'
  const recovered = await packagedMewUpdate(install, true)
  assert.equal(recovered.latestVersion, '0.9.0')
  assert.equal(recovered.available, false)
  assert.equal(recovered.error, null)
  assert.equal(recovered.updateInstruction, null)

  version = 'invalid'
  assert.match((await packagedMewUpdate(install, true)).error!, /최신 배포 버전/)
  const legacy = await packagedMewUpdate({ channel: 'unknown', version: null }, true)
  assert.equal(legacy.supported, false)
  assert.equal(request.mock.callCount(), 4)
})
