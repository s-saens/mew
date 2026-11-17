import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const windowsAssets = ['installer-core.ps1', 'launcher-core.ps1', 'launch.ps1', 'bootstrap-linux.sh', 'launch-linux.sh', 'verify-linux.sh', 'downloads.json', 'npm-setup.ps1']

export async function prepareWindowsAssets({ root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..') } = {}) {
  const destination = path.join(root, 'apps/cli/windows-assets')
  await fs.mkdir(destination, { recursive: true })
  for (const name of windowsAssets) await fs.copyFile(path.join(root, 'apps/windows-installer', name), path.join(destination, name))
  return destination
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepareWindowsAssets()
