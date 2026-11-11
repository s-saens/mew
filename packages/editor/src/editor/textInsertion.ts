import type { Editor } from '@tiptap/core'

/** Capture a destination before opening an asynchronous input dialog. */
export function prepareTextInsertion(editor: Editor, isCurrent: () => boolean = () => true): (text: string) => boolean {
  const { doc, selection } = editor.state
  let used = false
  return text => {
    if (used || !isCurrent() || editor.isDestroyed || !editor.isEditable || editor.state.doc !== doc) return false
    const lines = text.replace(/\r\n?/g, '\n').split('\n')
    const content = lines.flatMap((line, index) => [
      ...(index ? [{ type: 'hardBreak' }] : []),
      ...(line ? [{ type: 'text', text: line }] : []),
    ])
    if (!content.length) return false
    const inserted = editor.chain().focus().insertContentAt({ from: selection.from, to: selection.to }, content).run()
    if (inserted) used = true
    return inserted
  }
}
