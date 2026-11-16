import { attachmentKind, uploadedAttachmentTokens } from './agent-attachments.ts'

type AttachmentLabels = Record<ReturnType<typeof attachmentKind>, string>

export function historyDisplayText(text: string, labels: AttachmentLabels): string {
  const tokens = uploadedAttachmentTokens(text)
  let result = ''
  let position = 0
  for (const token of tokens) {
    result += text.slice(position, token.from) + labels[attachmentKind('', token.path)]
    position = token.to
  }
  // Saved titles can end inside a long attachment reference.
  return result + text.slice(position).replace(/\[\[[^:\]\n]+:\.mew\/(?:temp\/assets|assets|files)\/[^\]\n]*$/u, labels.file)
}
