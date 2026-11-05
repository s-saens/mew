import fs from 'node:fs'
import { skillLibrary } from './skill-library.ts'

/** Git's validated plan format remains available when the optional workflow is off. */
export function activeCommitSkill(cwd: string): { path: string; content: string } {
  const skill = skillLibrary.resolve(cwd).find(item => item.name === 'commit')
  if (!skill) return { path: '', content: 'Group related changes into commits. Return {"commits":[{"title":"...","description":"...","files":["..."]}],"skipped":[{"file":"...","reason":"..."}]}. Preserve repository conventions and report only checks actually performed.' }
  const stat = fs.statSync(skill.path)
  if (!stat.isFile() || stat.size > 128_000) throw new Error('커밋 스킬은 128KB 이하의 일반 파일이어야 합니다')
  const content = fs.readFileSync(skill.path, 'utf8')
  if (!content.trim()) throw new Error('커밋 스킬이 비어 있습니다. Skills 관리에서 지침을 작성하세요.')
  return { path: skill.path, content }
}
