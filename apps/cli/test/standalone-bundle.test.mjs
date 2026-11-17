import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as tar from 'tar'
import { bundleStandalone } from '../tools/bundle-standalone.mjs'

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-standalone-test-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const packageRoot = path.join(root, 'source')
  await fs.mkdir(path.join(packageRoot, 'bin'), { recursive: true })
  await fs.mkdir(path.join(packageRoot, 'src'))
  await fs.writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'mew-ide', version: '1.2.3', type: 'module', dependencies: { 'fixture-standalone-dep': '1.0.0' } }))
  await fs.writeFile(path.join(packageRoot, 'LICENSE'), 'Mew fixture license\n')
  await fs.writeFile(path.join(packageRoot, 'bin/mew.mjs'), "import { value } from '../src/value.mjs'; console.log(value)\n")
  await fs.writeFile(path.join(packageRoot, 'src/value.mjs'), "import dep from 'fixture-standalone-dep'; export const value = dep\n")
  const dependency = path.join(packageRoot, 'node_modules', 'fixture-standalone-dep')
  await fs.mkdir(dependency, { recursive: true })
  await fs.writeFile(path.join(dependency, 'package.json'), JSON.stringify({ name: 'fixture-standalone-dep', version: '1.0.0', main: 'index.js', dependencies: { 'fixture-transitive-dep': '1.0.0' } }))
  await fs.writeFile(path.join(dependency, 'index.js'), "module.exports = require('fixture-transitive-dep')\n")
  await fs.writeFile(path.join(dependency, 'LICENSE'), 'Dependency fixture license\n')
  const transitive = path.join(packageRoot, 'node_modules', 'fixture-transitive-dep')
  await fs.mkdir(transitive)
  await fs.writeFile(path.join(transitive, 'package.json'), JSON.stringify({ name: 'fixture-transitive-dep', version: '1.0.0', main: 'index.js' }))
  await fs.writeFile(path.join(transitive, 'index.js'), "module.exports = 'standalone dependency closure works'\n")
  const installerPath = path.join(root, 'install.sh')
  await fs.writeFile(installerPath, '#!/bin/bash\nMEW_INSTALL_VERSION_DEFAULT="1.2.3"\n')
  return { root, packageRoot, dependency, transitive, installerPath }
}

test('standalone archive includes executable and complete dependencies with licenses, excluding private and test files', async t => {
  const { root, packageRoot, dependency, installerPath } = await fixture(t)
  for (const name of ['.env', '.data/account.json', 'test/secret.test.mjs', 'windows-assets/private.txt', 'src/example.test.mjs', 'src/.env']) {
    await fs.mkdir(path.dirname(path.join(packageRoot, name)), { recursive: true })
    await fs.writeFile(path.join(packageRoot, name), 'private fixture data')
  }
  await fs.mkdir(path.join(dependency, 'test'))
  await fs.writeFile(path.join(dependency, 'test/private.json'), 'private dependency fixture')
  const output = path.join(root, 'artifacts')
  const artifact = await bundleStandalone({ packageRoot, output, installerPath })
  const bytes = await fs.readFile(artifact.archive)
  assert.equal(artifact.checksum, createHash('sha256').update(bytes).digest('hex'))
  assert.equal(await fs.readFile(`${artifact.archive}.sha256`, 'utf8'), `${artifact.checksum}  mew-cli-standalone.tar.gz\n`)
  assert.equal(await fs.readFile(path.join(output, 'install.sh'), 'utf8'), await fs.readFile(installerPath, 'utf8'))
  const installerChecksum = createHash('sha256').update(await fs.readFile(installerPath)).digest('hex')
  assert.equal(await fs.readFile(path.join(output, 'install.sh.sha256'), 'utf8'), `${installerChecksum}  install.sh\n`)
  const entries = []
  await tar.t({ file: artifact.archive, onReadEntry: entry => entries.push({ path: entry.path, type: entry.type }) })
  assert.ok(entries.every(entry => !path.posix.isAbsolute(entry.path) && !entry.path.split('/').includes('..') && ['File', 'Directory'].includes(entry.type)))
  assert.ok(entries.some(entry => entry.path === 'node_modules/fixture-standalone-dep/LICENSE'))
  assert.ok(entries.every(entry => !entry.path.includes('.env') && !entry.path.includes('/test/') && !entry.path.startsWith('test/') && !entry.path.includes('windows-assets') && !entry.path.includes('.data') && !entry.path.includes('.test.')))
  const extracted = path.join(root, 'extracted')
  await fs.mkdir(extracted)
  await tar.x({ file: artifact.archive, cwd: extracted })
  await fs.rm(packageRoot, { recursive: true })
  const result = await promisify(execFile)(process.execPath, [path.join(extracted, 'bin/mew.mjs')])
  assert.equal(result.stdout.trim(), 'standalone dependency closure works')
  if (process.platform !== 'win32') assert.ok((await fs.stat(path.join(extracted, 'bin/mew.mjs'))).mode & 0o111)
})

test('standalone archive bytes do not depend on source mtimes or temporary build paths', async t => {
  const { root, packageRoot, installerPath } = await fixture(t)
  const first = await bundleStandalone({ packageRoot, installerPath, output: path.join(root, 'first') })
  await fs.utimes(path.join(packageRoot, 'bin/mew.mjs'), new Date(), new Date())
  const second = await bundleStandalone({ packageRoot, installerPath, output: path.join(root, 'second') })
  assert.equal(first.checksum, second.checksum)
})

test('standalone packaging fails for missing required dependencies without leaving release artifacts', async t => {
  const { root, packageRoot, transitive, installerPath } = await fixture(t)
  await fs.rm(transitive, { recursive: true })
  const output = path.join(root, 'artifacts')
  await assert.rejects(bundleStandalone({ packageRoot, output, installerPath }), /Standalone dependency fixture-transitive-dep is unavailable/)
  await assert.rejects(fs.access(output), { code: 'ENOENT' })
})

test('standalone packaging rejects symlinks instead of including files outside its package', { skip: process.platform === 'win32' }, async t => {
  const { root, packageRoot, installerPath } = await fixture(t)
  await fs.writeFile(path.join(root, 'private.txt'), 'private fixture')
  await fs.symlink(path.join(root, 'private.txt'), path.join(packageRoot, 'src/private.mjs'))
  await assert.rejects(bundleStandalone({ packageRoot, installerPath, output: path.join(root, 'artifacts') }), /Unsupported standalone input/)
})

test('release assets reject a bootstrap pinned to a different package version', async t => {
  const { root, packageRoot, installerPath } = await fixture(t)
  await fs.writeFile(installerPath, '#!/bin/bash\nMEW_INSTALL_VERSION_DEFAULT="4.5.6"\n')
  await assert.rejects(bundleStandalone({ packageRoot, installerPath, output: path.join(root, 'artifacts') }), /install.sh must pin/)
})

test('the real standalone CLI opens help without npm or the source checkout', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-real-standalone-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const artifact = await bundleStandalone({ output: path.join(root, 'artifacts') })
  const extracted = path.join(root, 'cli')
  await fs.mkdir(extracted)
  await tar.x({ file: artifact.archive, cwd: extracted })
  const result = await promisify(execFile)(process.execPath, [path.join(extracted, 'bin/mew.mjs'), '--help'], { cwd: root, env: { ...process.env, NODE_PATH: '' } })
  assert.match(result.stdout, /Usage: mew-ide/)
  assert.match(result.stdout, /curl installer supplies Node.js/)
})

test('release workflow verifies all eight assets and rejects replacement bytes or incomplete releases', { skip: process.platform === 'win32' }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-release-fixture-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const fakeBin = path.join(root, 'bin'), published = path.join(root, 'published')
  await fs.mkdir(fakeBin)
  await fs.mkdir(published)
  await fs.writeFile(path.join(fakeBin, 'gh'), `#!/bin/bash
set -eu
case "$1 $2" in
  'release view') exit 0 ;;
  'release download')
    while [ "$#" -gt 0 ]; do
      if [ "$1" = --dir ]; then target="$2"; break; fi
      shift
    done
    cp "$PUBLISHED_ASSETS/"* "$target/"
    ;;
  *) echo 'Unexpected GitHub operation in fixture' >&2; exit 1 ;;
esac
`, { mode: 0o755 })
  const assets = ['mew-runtime-linux-x64.tar.gz', 'mew-runtime-linux-arm64.tar.gz', 'mew-runtime-darwin-x64.tar.gz', 'mew-runtime-darwin-arm64.tar.gz', 'mew-runtime-win32-x64.tar.gz', 'mew-runtime-win32-arm64.tar.gz', 'mew-cli-standalone.tar.gz', 'install.sh']
  for (const file of assets) await fs.writeFile(path.join(published, file), `release fixture ${file}\n`)
  const manifest = async directory => {
    const checksums = await Promise.all(assets.map(async file => `${createHash('sha256').update(await fs.readFile(path.join(directory, file))).digest('hex')}  ${file}\n`))
    return checksums.sort((a, b) => a.split('  ')[1].localeCompare(b.split('  ')[1], 'en')).join('')
  }
  await fs.writeFile(path.join(published, 'SHA256SUMS'), await manifest(published))
  const workflow = await fs.readFile(new URL('../../../.github/workflows/cli-release.yml', import.meta.url), 'utf8')
  const script = workflow.split('      - name: Create immutable runtime release\n')[1].split('\n  npm:')[0].split('        run: |\n')[1].split('\n').map(line => line.replace(/^          /, '')).join('\n')
  const execute = async (name, change) => {
    const directory = path.join(root, name), output = path.join(directory, 'artifacts')
    await fs.mkdir(output, { recursive: true })
    for (const file of assets) {
      await fs.copyFile(path.join(published, file), path.join(output, file))
      const bytes = await fs.readFile(path.join(output, file))
      await fs.writeFile(path.join(output, `${file}.sha256`), `${createHash('sha256').update(bytes).digest('hex')}  ${file}\n`)
    }
    await change?.(output)
    return promisify(execFile)('bash', ['-e', '-o', 'pipefail', '-c', script], { cwd: directory, env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, PUBLISHED_ASSETS: published, PUBLISH_NPM: 'false', RELEASE_TAG: 'mew-cli-v1.2.3', REPOSITORY: 'fixture/mew', GH_TOKEN: '' } })
  }
  await execute('identical')
  await assert.rejects(execute('replacement', async output => {
    const file = 'mew-cli-standalone.tar.gz'
    await fs.writeFile(path.join(output, file), 'replacement bytes')
    await fs.writeFile(path.join(output, `${file}.sha256`), `${createHash('sha256').update('replacement bytes').digest('hex')}  ${file}\n`)
  }), error => /different asset bytes/.test(error.stderr))
  await assert.rejects(execute('missing-standalone', async output => {
    await fs.rm(path.join(output, 'mew-cli-standalone.tar.gz'))
    await fs.rm(path.join(output, 'mew-cli-standalone.tar.gz.sha256'))
  }))
})
