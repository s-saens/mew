import type { AgentAttachmentRef } from '../../shared/agent-attachment'

type FileReference = { from: number; to: number; token: string; project: string; path: string; title?: string }
const UPLOADED_ATTACHMENT_TOKEN = /\[\[([^:\]\n]+):(\.mew\/(?:temp\/assets|assets|files)\/[^\]\n]+)\]\]/g
const escapeReference = (value: string) => value.replace(/[\\|[\]\r\n]/g, char => `\\${char === '\n' ? 'n' : char === '\r' ? 'r' : char}`)
const unescapeReference = (value: string) => value.replace(/\\([\\|[\]nr])/g, (_, char: string) => char === 'n' ? '\n' : char === 'r' ? '\r' : char)

export function documentReference(project: string, path: string, title: string): string {
  return `[[mew-document:${encodeURIComponent(project)}:${escapeReference(path)}|${escapeReference(title)}]]`
}

export function documentReferenceTokens(text: string): FileReference[] {
  const legacy: FileReference[] = [...text.matchAll(/\[\[([^:[\]\r\n]+):([^\r\n[\]]+)\]\]/g)]
    .filter(match => match[1] !== 'mew-upload' && match[1] !== 'mew-document' && !/^\.mew\/(?:temp\/assets|assets|files)\//.test(match[2]))
    .map(match => ({ from: match.index, to: match.index + match[0].length, token: match[0], project: match[1], path: match[2] }))
  const titled: FileReference[] = [...text.matchAll(/\[\[mew-document:([^:[\]\r\n]+):((?:\\[^\r\n]|[^\r\n[\]\\])+)\]\]/g)].flatMap(match => {
    const body = match[2]
    let separator = -1
    for (let index = 0; index < body.length; index++) {
      if (body[index] === '\\') index++
      else if (body[index] === '|') { separator = index; break }
    }
    if (separator <= 0) return []
    let project: string
    try { project = decodeURIComponent(match[1]) } catch { return [] }
    if (!project) return []
    return [{ from: match.index, to: match.index + match[0].length, token: match[0], project,
      path: unescapeReference(body.slice(0, separator)), title: unescapeReference(body.slice(separator + 1)) }]
  })
  return [...legacy, ...titled].sort((a, b) => a.from - b.from)
}

export function uploadedAttachmentTokens(text: string): FileReference[] {
  return [...text.matchAll(UPLOADED_ATTACHMENT_TOKEN)].map(match => ({
    from: match.index, to: match.index + match[0].length, token: match[0], project: match[1], path: match[2],
  }))
}

export function withoutAttachmentTokens(text: string): string {
  return text.replace(UPLOADED_ATTACHMENT_TOKEN, '').replace(/\[\[mew-upload:[^\]\n]+\]\]/g, '')
}

export function attachmentKind(mimeType: string, path: string): 'image' | 'video' | 'audio' | 'file' {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType && mimeType !== 'application/octet-stream') return 'file'
  const extension = path.split('.').at(-1)?.toLowerCase() ?? ''
  if (/^(jpe?g|png|gif|webp|svg|avif|heic|bmp|ico|tiff?)$/.test(extension)) return 'image'
  if (/^(mp4|webm|mov|m4v|avi|mkv|ogv)$/.test(extension)) return 'video'
  if (/^(mp3|wav|ogg|m4a|aac|flac|opus)$/.test(extension)) return 'audio'
  return 'file'
}

export function conversationAttachments(text: string, attachments: AgentAttachmentRef[], images: { path: string; mimeType: string }[], project: string): AgentAttachmentRef[] {
  const files = new Map<string, AgentAttachmentRef>()
  for (const file of [...attachments, ...images.map(image => ({ ...image, project }))]) {
    files.set(JSON.stringify([file.project, file.path]), file)
  }
  // Runtime transcripts can retain uploaded-file references without Mew's metadata events.
  for (const file of uploadedAttachmentTokens(text)) {
    const key = JSON.stringify([file.project, file.path])
    if (!files.has(key)) files.set(key, { project: file.project, path: file.path, mimeType: '' })
  }
  return [...files.values()]
}
