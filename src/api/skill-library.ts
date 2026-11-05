import { mewFetch } from '../utils/remote-transport.ts'
import { uiText } from '@mew/ui/i18n-core'
import type { SkillLibraryDetail, SkillLibraryInventory, SkillLibraryMutation } from '../../shared/skill-library'

async function result<T>(response: Response): Promise<T> {
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || uiText('요청을 처리하지 못했습니다'))
  return body
}

export function fetchSkillLibrary(cwd: string, signal?: AbortSignal) {
  return mewFetch(`/api/agent/skill-library?${new URLSearchParams({ cwd })}`, { signal }).then(result<SkillLibraryInventory>)
}

export function fetchSkillLibraryDetail(cwd: string, id: string, signal?: AbortSignal) {
  return mewFetch(`/api/agent/skill-library/detail?${new URLSearchParams({ cwd, id })}`, { signal }).then(result<SkillLibraryDetail>)
}

export function mutateSkillLibrary(input: SkillLibraryMutation) {
  return mewFetch('/api/agent/skill-library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }).then(result<{ ok: boolean }>)
}
