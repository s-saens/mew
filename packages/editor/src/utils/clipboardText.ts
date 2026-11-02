import type { Fragment, Node, Slice } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import { TableMap } from '@tiptap/pm/tables'
import { unwrapOpenListWrappers } from './clipboardList.ts'
import { selectedTableCellText } from './clipboardTable.ts'

/** Readable clipboard text comes from the model, so literal Markdown characters survive. */
export function clipboardTextSerializer(slice: Slice, view: EditorView): string {
  const cellText = selectedTableCellText(view.state.selection)
  if (cellText !== null) return cellText
  let content = unwrapOpenListWrappers(slice.content, slice.openStart, slice.openEnd)
  const last = content.lastChild
  // The final empty input paragraph is display scaffolding rather than copied content.
  if (content.childCount > 1 && last?.type.name === 'paragraph' && !last.textContent
    && last.childCount <= 1 && (!last.firstChild || last.firstChild.type.name === 'hardBreak')
    && view.state.selection.to >= view.state.doc.content.size - 1) {
    content = content.cut(0, content.size - last.nodeSize)
  }
  return fragmentText(content, '\n\n')
}

function fragmentText(content: Fragment, separator: string): string {
  const parts: string[] = []
  content.forEach(node => parts.push(nodeText(node)))
  return parts.join(separator)
}

function nodeText(node: Node): string {
  if (node.isText) return node.text ?? ''
  switch (node.type.name) {
    case 'paragraph':
      if (node.childCount === 1 && node.firstChild?.type.name === 'hardBreak') return ''
      return fragmentText(node.content, '')
    case 'hardBreak': return '\n'
    case 'horizontalRule': return '────────'
    case 'codeBlock': return node.textContent
    case 'bulletList':
    case 'orderedList':
    case 'taskList': {
      const items: string[] = []
      node.forEach((item, _offset, index) => {
        const marker = node.type.name === 'orderedList' ? `${(node.attrs.start ?? 1) + index}. `
          : node.type.name === 'taskList' ? (item.attrs.checked ? '☑ ' : '☐ ') : '• '
        const text = fragmentText(item.content, '\n')
        items.push(marker + text.replace(/\n/g, '\n  '))
      })
      return items.join('\n')
    }
    case 'table': return tableText(node)
    case 'tableRow': return fragmentText(node.content, '\t')
    case 'tableCell':
    case 'tableHeader': return fragmentText(node.content, '\n')
    case 'image': return node.attrs.alt || node.attrs.src || ''
    case 'audio':
    case 'video': return node.attrs.src || ''
    case 'youtube': return node.attrs.videoId ? `https://www.youtube.com/watch?v=${node.attrs.videoId}` : ''
    default:
      if (node.isLeaf) return node.type.spec.leafText?.(node) ?? ''
      return fragmentText(node.content, node.inlineContent ? '' : '\n\n')
  }
}

function tableText(table: Node): string {
  const grid = TableMap.get(table)
  const seen = new Set<number>()
  const rows: string[] = []
  for (let row = 0; row < grid.height; row++) {
    const cells: string[] = []
    for (let column = 0; column < grid.width; column++) {
      const position = grid.map[row * grid.width + column]
      const cell = position > 0 && !seen.has(position) ? table.nodeAt(position) : null
      cells.push(cell ? nodeText(cell) : '')
      seen.add(position)
    }
    rows.push(cells.join('\t'))
  }
  return rows.join('\n')
}
