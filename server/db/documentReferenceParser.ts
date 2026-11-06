import MarkdownIt from 'markdown-it'
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5'
import { isDbId } from '../../packages/editor/src/database/databaseMarkdown.ts'

export interface DocumentDatabaseReference {
  databaseId: string
  line: number
  occurrence: number
}

const markdown = new MarkdownIt({ html: true })
const inertTags = new Set(['pre', 'code', 'script', 'style', 'textarea', 'template'])

/** Read actual document blocks, excluding frontmatter and Markdown/HTML examples. */
export function documentDatabaseReferences(content: string): DocumentDatabaseReference[] {
  if (!/data-mew-db\s*=/i.test(content)) return []
  const body = content.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, header => header.replace(/[^\r\n]/g, ' '))
  const references: DocumentDatabaseReference[] = []
  const occurrences = new Map<string, number>()
  for (const token of markdown.parse(body, {})) {
    if (token.type !== 'html_block' || !token.map) continue
    const firstLine = token.map[0]
    const visit = (node: DefaultTreeAdapterMap['node']): void => {
      if ('tagName' in node) {
        if (inertTags.has(node.tagName)) return
        const id = node.tagName === 'div' ? node.attrs.find(attr => attr.name === 'data-mew-db')?.value : undefined
        if (isDbId(id) && node.sourceCodeLocation?.endTag) {
          const databaseId = id.toLowerCase()
          const occurrence = occurrences.get(databaseId) ?? 0
          references.push({ databaseId, line: firstLine + node.sourceCodeLocation.startLine, occurrence })
          occurrences.set(databaseId, occurrence + 1)
        }
      }
      if ('childNodes' in node) node.childNodes.forEach(visit)
    }
    visit(parseFragment(token.content, { sourceCodeLocationInfo: true }))
  }
  return references
}
