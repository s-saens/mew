/** Uploaded file metadata. Image bytes stay in the supervisor, not queue snapshots. */
export type AgentAttachmentRef = {
  project: string
  path: string
  mimeType: string
}

export type AgentAttachmentInput = AgentAttachmentRef & {
  image?: { data: string; mimeType: string }
}

export const UPLOADED_ATTACHMENT_TOKEN = /\[\[([^:\]\n]+):(\.mew\/(?:temp\/assets|assets|files)\/[^\]\n]+)\]\]/g

export function withoutAttachmentTokens(text: string): string {
  return text.replace(UPLOADED_ATTACHMENT_TOKEN, '').replace(/\[\[mew-upload:[^\]\n]+\]\]/g, '')
}

export function attachmentPrompt(text: string, attachments: AgentAttachmentRef[]): string {
  const written = text.trim()
  const missing = new Set(attachments.map(file => `[[${file.project}:${file.path}]]`).filter(token => !written.includes(token)))
  return [written, ...missing].filter(Boolean).join('\n')
}
