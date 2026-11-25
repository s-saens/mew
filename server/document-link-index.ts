import fs from 'node:fs/promises'
import path from 'node:path'
import MarkdownIt from 'markdown-it'
import { parseDocument } from 'yaml'
import { parseTitle } from './frontmatter.ts'
import type { DocumentLinkStorage } from './document-link-storage.ts'

const markdown = new MarkdownIt({ html: false, linkify: false })
export const DOCUMENT_MAX_BYTES = 8 * 1024 * 1024

export function documentLinks(content: string): { title: string | null; links: string[] } {
  const links = new Set<string>()
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
  for (const block of markdown.parse(body, {})) {
    for (const token of block.children ?? []) {
      if (token.type === 'link_open') {
        const href = token.attrGet('href')
        if (href) links.add(href)
      }
      // Wiki-style links are optional syntax; only ordinary text is scanned.
      if (token.type === 'text') for (const match of token.content.matchAll(/\[\[([^\]\n]+)\]\]/g)) links.add(`wiki:${match[1].split('|')[0]}`)
    }
  }
  return { title: parseTitle(content), links: [...links] }
}


export type DocumentLinkEntry = { path: string; title: string; links: string[]; parents: string[] }
type Cached = { stamp: string; entry: DocumentLinkEntry }

type DocumentLinkScan = {
  lookup(file: string, stamp: string): DocumentLinkEntry | undefined
  remember(file: string, cached: Cached): void
  flush(): void
}

function parentFiles(content: string): string[] {
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)
  if (!header) return []
  try {
    const yaml = parseDocument(header[1])
    if (yaml.errors.length) return []
    const value = (yaml.toJS() as Record<string, unknown>)?.['상위파일']
    return (Array.isArray(value) ? value : [value]).filter((item): item is string => typeof item === 'string')
  } catch { return [] }
}

/** Graph and backlinks share parsed files; access decisions are never cached. */
export class DocumentLinkIndex {
  private cache = new Map<string, Cached>()
  private dirty = new Set<string>()

  invalidate(files: string[]): void { for (const file of files) this.dirty.add(path.resolve(file)) }

  scan(storage?: DocumentLinkStorage): DocumentLinkScan {
    const pending = new Map<string, Cached>()
    return {
      lookup: (file, stamp) => storage?.read(file, stamp),
      remember: (file, cached) => { if (storage) pending.set(file, cached) },
      flush: () => {
        storage?.write([...pending].map(([file, cached]) => ({ file, ...cached })))
        pending.clear()
      },
    }
  }

  async read(file: string, scan?: DocumentLinkScan, discovered = false): Promise<DocumentLinkEntry | null> {
    const absolute = discovered ? file : await fs.realpath(file)
    const stat = discovered ? await fs.lstat(absolute) : await fs.stat(absolute)
    if (!stat.isFile() || stat.size > DOCUMENT_MAX_BYTES) return null
    const stamp = `${stat.dev}:${stat.ino}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`
    const previous = this.cache.get(absolute)
    if (previous?.stamp === stamp && !this.dirty.has(absolute)) return previous.entry
    let entry = this.dirty.has(absolute) ? undefined : scan?.lookup(absolute, stamp)
    if (!entry) {
      if (discovered && await fs.realpath(absolute) !== absolute) return null
      const content = await fs.readFile(absolute, 'utf8'), parsed = documentLinks(content)
      entry = { path: absolute, title: parsed.title || path.basename(absolute, path.extname(absolute)), links: parsed.links, parents: parentFiles(content) }
      scan?.remember(absolute, { stamp, entry })
    }
    this.dirty.delete(absolute)
    if (this.cache.size >= 50_000) this.cache.delete(this.cache.keys().next().value!)
    this.cache.set(absolute, { stamp, entry })
    return entry
  }

  remove(file: string): void { this.cache.delete(path.resolve(file)); this.dirty.delete(path.resolve(file)) }
}
