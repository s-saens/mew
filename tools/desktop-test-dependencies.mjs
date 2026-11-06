import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** Package tests need only YAML, not the application's agent/native packages. */
export async function prepareDesktopTestDependencies({ root, run = spawnSync } = {}) {
  const lock = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8'))
  const yaml = lock.packages?.['node_modules/yaml']
  if (!yaml?.version || !yaml.resolved || !yaml.integrity) throw new Error('The root lockfile must pin the YAML test dependency and its integrity.')
  if (Object.keys(yaml.dependencies || {}).length || Object.keys(yaml.optionalDependencies || {}).length) throw new Error('YAML has transitive dependencies; update desktop test dependency preparation before building.')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-desktop-test-deps-'))
  try {
    const manifest = { name: 'mew-desktop-test-dependencies', version: '0.0.0', private: true, dependencies: { yaml: yaml.version } }
    await fs.writeFile(path.join(temporary, 'package.json'), JSON.stringify(manifest))
    await fs.writeFile(path.join(temporary, 'package-lock.json'), JSON.stringify({
      name: manifest.name, version: manifest.version, lockfileVersion: 3, requires: true,
      packages: { '': manifest, 'node_modules/yaml': yaml },
    }))
    const npm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
    const result = run(process.execPath, [npm, 'ci', '--prefix', temporary, '--ignore-scripts', '--no-audit', '--no-fund'], { stdio: 'inherit', timeout: 120_000 })
    if (result.error || result.status !== 0) throw new Error(`Desktop test dependency installation failed: ${result.error?.message || result.signal || result.status}`)
    await fs.mkdir(path.join(root, 'node_modules'), { recursive: true })
    const destination = path.join(root, 'node_modules/yaml')
    // A fresh checkout has no YAML installation to replace.
    await fs.mkdir(destination)
    try { await fs.cp(path.join(temporary, 'node_modules/yaml'), destination, { recursive: true }) }
    catch (error) { await fs.rm(destination, { recursive: true, force: true }); throw error }
  } finally { await fs.rm(temporary, { recursive: true, force: true }) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareDesktopTestDependencies({ root: fileURLToPath(new URL('../', import.meta.url)) })
}
