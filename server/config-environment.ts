import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hostPaths } from './platform/storage.ts'

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Read host settings before the application-local environment file. */
export function configFiles({ configDirectory = hostPaths().config, appRoot = APP_ROOT }: {
  configDirectory?: string
  appRoot?: string
} = {}): string[] {
  return [path.join(configDirectory, 'config.env'), path.join(appRoot, '.env')]
}

/** Load environment settings without creating state directories or changing permissions. */
export function loadConfigEnvironment({ files = configFiles(), exists = fs.existsSync, load = process.loadEnvFile }: {
  files?: string[]
  exists?: (file: string) => boolean
  load?: (file: string) => void
} = {}): void {
  for (const file of files) if (exists(file)) load(file)
}
