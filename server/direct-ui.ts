import { readFile } from 'node:fs/promises'
import type { Response } from 'express'
import { parse, type DefaultTreeAdapterMap } from 'parse5'

/** Direct SPA entrypoints resolve build resources from the host root, even at deep links. */
export function directUiHtml(html: string): string {
  const edits: { start: number; end: number; text: string }[] = []
  const visit = (node: DefaultTreeAdapterMap['node']) => {
    if ('tagName' in node && (node.tagName === 'script' || node.tagName === 'link')) {
      const name = node.tagName === 'script' ? 'src' : 'href'
      const attribute = node.attrs.find(attribute => attribute.name === name)
      const location = node.sourceCodeLocation?.attrs?.[name]
      if (attribute?.value.startsWith('./') && location) {
        const original = html.slice(location.startOffset, location.endOffset)
        edits.push({ start: location.startOffset, end: location.endOffset, text: original.replace(/^([^=]+=\s*["']?)\.\//, '$1/') })
      }
    }
    if ('childNodes' in node) node.childNodes.forEach(visit)
  }
  visit(parse(html, { sourceCodeLocationInfo: true }))
  for (const edit of edits.sort((a, b) => b.start - a.start)) html = html.slice(0, edit.start) + edit.text + html.slice(edit.end)
  return html
}

export async function sendDirectUiHtml(res: Response, file: string): Promise<void> {
  res.type('html').send(directUiHtml(await readFile(file, 'utf8')))
}
