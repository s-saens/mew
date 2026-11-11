import type { EditorView } from '@codemirror/view'
import { isolateHistory } from '@codemirror/commands'

export function prepareCodeTextInsertion(view: EditorView, isCurrent: () => boolean): (text: string) => boolean {
  const { doc, selection } = view.state
  let used = false
  return text => {
    if (used || !text || !isCurrent() || view.state.readOnly || view.state.doc !== doc) return false
    view.dispatch({
      changes: { from: selection.main.from, to: selection.main.to, insert: text },
      selection: { anchor: selection.main.from + text.length },
      annotations: isolateHistory.of('full'),
      userEvent: 'input', scrollIntoView: true,
    })
    used = true
    view.focus()
    return true
  }
}
