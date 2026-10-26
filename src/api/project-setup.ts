import { mewFetch } from '../utils/remote-transport.ts'
import type { ProjectGuidanceSnapshot, ProjectSetupInput, ProjectSetupPlan } from '../../shared/project-agent-context'

async function request<T>(body?: unknown): Promise<T> {
  const response = await mewFetch('/api/docs/agent-context', body === undefined ? { cache: 'no-store' } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const value = await response.json()
  if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`)
  return value as T
}

export const fetchProjectSetup = () => request<ProjectGuidanceSnapshot>()
export async function saveProjectGuidance(input: { projectRoot: string; instructions: string; enabled?: boolean; revision: string }): Promise<ProjectGuidanceSnapshot> {
  const response = await mewFetch('/api/docs/agent-context', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
  const value = await response.json()
  if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`)
  return value
}
export const previewProjectSetup = (input: ProjectSetupInput) => request<ProjectSetupPlan>({ ...input, action: 'preview' })
export const saveProjectSetup = (input: ProjectSetupInput, revision: string) => request<ProjectSetupPlan>({ ...input, action: 'apply', revision })
