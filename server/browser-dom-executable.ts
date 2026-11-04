import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function isExecutable(file: string): boolean {
  try {
    if (!fs.statSync(file).isFile()) return false
    fs.accessSync(file, fs.constants.X_OK)
    return true
  } catch { return false }
}

function isValidObscuraExecutable(file: string): boolean {
  if (!isExecutable(file)) return false
  try {
    const resolved = fs.realpathSync(file)
    return isExecutable(path.join(path.dirname(resolved), 'obscura-worker'))
  } catch {
    return isExecutable(path.join(path.dirname(file), 'obscura-worker'))
  }
}

function installedObscuraCandidates(home: string, pathEnv: string): string[] {
  const candidates: string[] = []
  for (const dir of pathEnv.split(path.delimiter).map(item => item.trim()).filter(Boolean)) {
    candidates.push(path.join(dir, 'obscura'))
  }
  if (home) {
    candidates.push(path.join(home, '.local', 'bin', 'obscura'))
    const shareRoot = path.join(home, '.local', 'share', 'obscura')
    try {
      const versions = fs.readdirSync(shareRoot, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      for (const version of versions) {
        candidates.push(path.join(shareRoot, version, 'obscura'))
      }
    } catch {}
  }
  return candidates
}

/** Resolve Obscura for the internal DOM browser on the server OS/user. */
export function domBrowserExecutable({
  env = process.env, home = os.homedir(),
}: { env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform; home?: string; bundledExecutable?: string } = {}): string | undefined {
  for (const key of ['MEW_DOM_BROWSER_EXECUTABLE', 'MEW_BROWSER_EXECUTABLE'] as const) {
    const explicit = env[key]
    if (explicit) {
      if (!path.isAbsolute(explicit) || !isExecutable(explicit)) {
        throw new Error(`서버 Obscura 실행 설정 ${key}에는 실행 가능한 파일의 절대 경로가 필요합니다.`)
      }
      return explicit
    }
  }
  return installedObscuraCandidates(home, env.PATH ?? '').find(isValidObscuraExecutable)
}

