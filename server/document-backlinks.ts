import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DocumentLinkIndex, documentLinks, type DocumentLinkEntry } from './document-link-index.ts'
import type { DocumentLinkStorage } from './document-link-storage.ts'

export type DocumentBacklink = { path: string; title: string }
export type DocumentBacklinks = { documents: DocumentBacklink[]; parents: DocumentBacklink[]; skipped: number }
const EXCLUDED = new Set(['.git', '.worktrees', 'node_modules', '.data', 'dist', 'build', '.next', '.venv', 'venv'])

function linkTarget(source: string, href: string): string | null {
  if (!href || href.startsWith('#') || href.startsWith('//')) return null
  try {
    if (href.startsWith('file:')) return fileURLToPath(new URL(href))
    if (/^[a-z][a-z\d+.-]*:/i.test(href)) return null
    const clean = decodeURIComponent(href.split(/[?#]/)[0])
    return clean ? path.resolve(path.dirname(source), clean) : null
  } catch { return null }
}

type Network = {
  entries: Map<string, DocumentLinkEntry>
  outgoing: Map<string, Set<string>>
  incoming: Map<string, Set<string>>
}

/** Incrementally maintain reverse edges using the same parsed index as the graph. */
export class DocumentBacklinkIndex {
  private networks = new Map<string, Network>()
  private readonly index: DocumentLinkIndex
  private readonly storage?: DocumentLinkStorage

  constructor(index = new DocumentLinkIndex(), storage?: DocumentLinkStorage) {
    this.index = index
    this.storage = storage
  }

  async read(target: string, roots: string[], mayRead: (absolute: string) => boolean, mayReadParent = mayRead): Promise<DocumentBacklinks> {
    const wanted = await fs.realpath(target)
    const files = new Set<string>()
    let skipped = 0
    const directories = new Set<string>()
    for (const root of await Promise.all(roots.map(root => fs.realpath(root).catch(() => null)))) {
      if (root) directories.add(root)
    }
    const queue = [...directories]
    // Read directories in batches so unrelated subtrees can make progress together.
    for (let offset = 0; offset < queue.length;) {
      const batch = queue.slice(offset, offset + 12)
      await Promise.all(batch.map(async directory => {
        try {
          if (await fs.realpath(directory) !== directory) return
          const children = await fs.readdir(directory, { withFileTypes: true })
          for (const child of children) {
            const absolute = path.join(directory, child.name)
            if (child.isDirectory() && !EXCLUDED.has(child.name) && !directories.has(absolute)) {
              directories.add(absolute)
              queue.push(absolute)
            } else if (child.isFile() && /\.md$/i.test(child.name)) {
              files.add(absolute)
            }
          }
        } catch { skipped++ }
      }))
      offset += batch.length
    }
    const visible = [...files], entries = new Map<string, DocumentLinkEntry>()
    const scan = this.index.scan(this.storage)
    let cursor = 0
    await Promise.all(Array.from({ length: Math.min(12, visible.length) }, async () => {
      while (cursor < visible.length) {
        const absolute = visible[cursor++]
        try {
          if (!mayRead(absolute)) continue
          const entry = await this.index.read(absolute, scan, true)
          if (entry) entries.set(absolute, entry)
          else skipped++
        } catch { skipped++; this.index.remove(absolute) }
      }
    }))
    scan.flush()
    const key = JSON.stringify([...new Set(roots.map(root => path.resolve(root)))].sort())
    const previous = this.networks.get(key)
    const fileSetChanged = !previous || entries.size !== previous.entries.size || [...entries.keys()].some(file => !previous.entries.has(file))
    const outgoing = new Map(fileSetChanged ? [] : previous.outgoing)
    const incoming = new Map(fileSetChanged ? [] : previous.incoming)
    const names = new Map<string, string | null>()
    for (const absolute of entries.keys()) {
      const name = path.basename(absolute, path.extname(absolute))
      names.set(name, names.has(name) ? null : absolute)
    }
    const resolved = new Map<string, Promise<string | null>>()
    const resolve = (absolute: string): Promise<string | null> => {
      if (entries.has(absolute) || absolute === wanted) return Promise.resolve(absolute)
      let request = resolved.get(absolute)
      if (!request) { request = fs.realpath(absolute).catch(() => null); resolved.set(absolute, request) }
      return request
    }
    const destinations = async (source: string, rawLinks: string[]): Promise<Set<string>> => {
      const targets = new Set<string>()
      for (const raw of rawLinks) {
        const wiki = raw.startsWith('wiki:'), href = wiki ? raw.slice(5) : raw
        const candidate = linkTarget(source, href)
        if (!candidate) continue
        let linked = await resolve(candidate)
        if (!linked && !path.extname(candidate)) linked = await resolve(candidate + '.md')
        if (!linked && wiki && !href.includes('/')) linked = names.get(href.split('#')[0].replace(/\.md$/i, '')) ?? null
        if (linked && linked !== source) targets.add(linked)
      }
      return targets
    }
    const updatedTargets = new Set<string>()
    const sourcesFor = (destination: string): Set<string> => {
      let sources = incoming.get(destination)
      if (!sources || !fileSetChanged && !updatedTargets.has(destination)) {
        sources = new Set(sources)
        incoming.set(destination, sources)
        updatedTargets.add(destination)
      }
      return sources
    }
    for (const [absolute, entry] of entries) {
      if (!fileSetChanged && previous.entries.get(absolute) === entry) continue
      for (const oldTarget of outgoing.get(absolute) ?? []) {
        const sources = sourcesFor(oldTarget)
        sources.delete(absolute)
        if (!sources.size) incoming.delete(oldTarget)
      }
      const targets = await destinations(absolute, entry.links)
      outgoing.set(absolute, targets)
      for (const newTarget of targets) sourcesFor(newTarget).add(absolute)
    }
    if (this.networks.size >= 4 && !this.networks.has(key)) this.networks.delete(this.networks.keys().next().value!)
    this.networks.set(key, { entries, outgoing, incoming })
    const targetEntry = entries.get(wanted) ?? await this.index.read(wanted)
    const parentLinks = targetEntry?.parents.flatMap(value => documentLinks(value).links.length ? documentLinks(value).links : [value]) ?? []
    const parentPaths = await destinations(wanted, parentLinks)
    const parents: DocumentBacklink[] = []
    for (const parent of parentPaths) {
      if (!mayReadParent(parent)) continue
      try {
        const entry = entries.get(parent) ?? await this.index.read(parent)
        if (entry && mayReadParent(parent)) parents.push({ path: parent, title: entry.title })
      } catch { /* Missing parents do not create navigation targets. */ }
    }
    const documents = [...(incoming.get(wanted) ?? [])]
      .filter(source => !parentPaths.has(source) && mayRead(source))
      .map(source => ({ path: source, title: entries.get(source)!.title }))
      .sort((a, b) => a.title.localeCompare(b.title) || a.path.localeCompare(b.path))
    return { documents, parents, skipped }
  }
}
