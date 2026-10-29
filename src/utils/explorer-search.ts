import type { SearchMatch, TreeNode } from '../api/client'
import { documentPageTarget, pageRepresentative } from '../../shared/document-pages.ts'
import type { DirectoryChildren } from './treePersistence'

export interface ExplorerSearch {
  query: string
  paths: readonly string[]
  matches: ReadonlyMap<string, SearchMatch[]>
  onOpenMatch: (path: string, match: SearchMatch) => void
  onClear?: () => void
  onReplaceFile?: (path: string) => void
}

/** Build only matching branches without loading or changing the browsing tree. */
export function explorerSearchTree(tree: TreeNode[], cached: DirectoryChildren, paths: readonly string[], documentPages: boolean, rootPath = '') {
  const known = new Map<string, TreeNode>()
  const order = new Map<string, number>()
  const visit = (nodes: TreeNode[]) => nodes.forEach((node, index) => {
    known.set(node.path, node)
    order.set(node.path, index)
    if (node.children) visit(node.children)
  })
  Object.values(cached).forEach(visit)
  visit(tree)
  const nodes = new Map<string, TreeNode>()
  const roots: TreeNode[] = []
  const openDirs = new Set<string>()
  const matched = new Map<string, string>()
  function ensure(path: string, type: 'file' | 'dir'): TreeNode {
    const previous = nodes.get(path)
    if (previous) return previous
    const source = known.get(path)
    const node: TreeNode = { ...source, path, name: source?.name ?? path.split('/').pop()!, type, ...(type === 'dir' ? { children: [] } : {}) }
    nodes.set(path, node)
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    if (parent && parent !== rootPath) ensure(parent, 'dir').children!.push(node)
    else roots.push(node)
    return node
  }
  for (const path of paths) {
    if (rootPath && !path.startsWith(`${rootPath}/`)) continue
    ensure(path, 'file')
    const target = documentPages ? documentPageTarget(path) : path
    if (!matched.has(target)) matched.set(target, path)
  }
  for (const node of nodes.values()) {
    if (node.type !== 'dir') continue
    openDirs.add(node.path)
    if (documentPages) {
      const representative = pageRepresentative(node.path, known.get(node.path)?.children ?? cached[node.path] ?? [])
      if (representative && !nodes.has(representative.path)) node.children!.push(representative)
    }
    node.children!.sort(compare)
  }
  function compare(a: TreeNode, b: TreeNode) {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    const aOrder = order.get(a.path), bOrder = order.get(b.path)
    return aOrder !== undefined && bOrder !== undefined ? aOrder - bOrder : a.name.localeCompare(b.name)
  }
  return { tree: roots.sort(compare), openDirs, matched }
}
