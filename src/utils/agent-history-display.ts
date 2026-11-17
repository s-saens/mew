import { attachmentKind, documentReferenceTokens, uploadedAttachmentTokens } from './agent-attachments.ts'

type AttachmentLabels = Record<ReturnType<typeof attachmentKind> | 'document', string>

export function historyDisplayText(text: string, labels: AttachmentLabels): string {
  const tokens = [
    ...uploadedAttachmentTokens(text).map(token => ({ ...token, label: labels[attachmentKind('', token.path)] })),
    ...documentReferenceTokens(text).map(token => ({ ...token, label: labels.document })),
  ].sort((a, b) => a.from - b.from)
  let result = ''
  let position = 0
  for (const token of tokens) {
    result += text.slice(position, token.from) + token.label
    position = token.to
  }
  // Saved titles can end inside a long attachment reference.
  return result + text.slice(position)
    .replace(/\[\[[^:\]\n]+:\.mew\/(?:temp\/assets|assets|files)\/[^\]\n]*$/u, labels.file)
    .replace(/\[\[mew-document:[^\n]*$/u, labels.document)
}
