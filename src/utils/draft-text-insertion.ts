import type { MentionInputHandle } from '../components/agent-composer-input'

export function prepareDraftTextInsertion(input: MentionInputHandle, isCurrent: () => boolean): (text: string) => boolean {
  const value = input.value, start = input.selectionStart, end = input.selectionEnd
  let used = false
  return text => {
    if (used || !text || value === undefined || !isCurrent() || input.value !== value || !input.insertText) return false
    input.setSelectionRange(start, end)
    input.insertText(text)
    input.focus()
    used = true
    return true
  }
}
