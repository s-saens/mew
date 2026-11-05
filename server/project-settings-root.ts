import fs from 'node:fs'
import path from 'node:path'

/** Shared boundary for project-local agent preferences; never scans other projects. */
export function projectSettingsRoot(cwd: string): string {
  const root = path.resolve(cwd)
  if (!fs.statSync(root).isDirectory()) throw new Error('프로젝트 폴더를 찾을 수 없습니다')
  let current = root
  while (true) {
    const marked = ['.mew', '.git'].some(name => {
      try { fs.lstatSync(path.join(current, name)); return true } catch { return false }
    })
    if (marked) return current
    if (path.dirname(current) === current) return root
    current = path.dirname(current)
  }
}
