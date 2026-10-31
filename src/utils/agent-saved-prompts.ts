import { scopedBrowserStorage } from '@mew/ui/browser-storage-scope'
import { writeBrowserStorage } from '@mew/ui/browser-storage'
import type { AgentAttachmentInput } from '../../shared/agent-attachment'
import { uuid } from './uuid.ts'

export type SavedAgentPrompt = {
  id: string
  text: string
  cliMode: boolean
  attachments: AgentAttachmentInput[]
}

const keyFor = (workspace: string) => `mew:agent-saved-prompts:${JSON.stringify(workspace)}`

export function readSavedAgentPrompts(workspace: string): SavedAgentPrompt[] {
  try {
    const stored: unknown = JSON.parse(scopedBrowserStorage().getItem(keyFor(workspace)) ?? '[]')
    if (!Array.isArray(stored)) return []
    return stored.filter((item): item is SavedAgentPrompt => {
      if (!item || typeof item.id !== 'string' || typeof item.text !== 'string' || !item.text.trim()
        || typeof item.cliMode !== 'boolean' || !Array.isArray(item.attachments)) return false
      return item.attachments.every((file: AgentAttachmentInput) => file && typeof file.project === 'string'
        && typeof file.path === 'string' && typeof file.mimeType === 'string'
        && (file.image === undefined || file.image && typeof file.image.data === 'string' && typeof file.image.mimeType === 'string'))
    })
  } catch { return [] }
}

export function saveAgentPrompt(workspace: string, prompt: Omit<SavedAgentPrompt, 'id'>): SavedAgentPrompt[] | null {
  const previous = readSavedAgentPrompts(workspace)
  if (!prompt.text.trim()) return previous
  const matching = previous.find(item => item.text === prompt.text && item.cliMode === prompt.cliMode
    && JSON.stringify(item.attachments) === JSON.stringify(prompt.attachments))
  const next = [{ ...prompt, id: matching?.id ?? uuid() }, ...previous.filter(item => item.id !== matching?.id)]
  return writeBrowserStorage(keyFor(workspace), JSON.stringify(next)) ? next : null
}

export function deleteSavedAgentPrompt(workspace: string, id: string): SavedAgentPrompt[] | null {
  const next = readSavedAgentPrompts(workspace).filter(item => item.id !== id)
  return writeBrowserStorage(keyFor(workspace), JSON.stringify(next)) ? next : null
}
