import { mewFetch } from '../utils/remote-transport.ts'
import type { ProjectGuidanceSnapshot, ProjectSetupInput, ProjectSetupPlan } from '../../shared/project-agent-context'

export function createProjectSetupClient(requestFetch: typeof mewFetch = mewFetch) {
  const scopedFetch = requestFetch


  async function request<T>(body?: unknown): Promise<T> {
    const response = await scopedFetch('/api/docs/agent-context', body === undefined ? { cache: 'no-store' } : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`)
    return value as T
  }

  const fetchProjectSetup = () => request<ProjectGuidanceSnapshot>()
  async function saveProjectGuidance(input: { projectRoot: string; instructions: string; enabled?: boolean; revision: string }): Promise<ProjectGuidanceSnapshot> {
    const response = await scopedFetch('/api/docs/agent-context', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`)
    return value
  }
  const previewProjectSetup = (input: ProjectSetupInput) => request<ProjectSetupPlan>({ ...input, action: 'preview' })
  const saveProjectSetup = (input: ProjectSetupInput, revision: string) => request<ProjectSetupPlan>({ ...input, action: 'apply', revision })
  return { fetchProjectSetup, saveProjectGuidance, previewProjectSetup, saveProjectSetup }
}

export const { fetchProjectSetup, saveProjectGuidance, previewProjectSetup, saveProjectSetup } = createProjectSetupClient()
