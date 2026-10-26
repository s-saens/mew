import type { GitBranchRef, GitLogEntry } from '../api/client'
import type { GraphRow } from './git-graph'

export type GraphBranchTargets = { node: GitBranchRef[]; edges: GitBranchRef[][] }

/** Track branch identities through first parents, independently of reused lanes. */
export function graphBranchTargets(commits: GitLogEntry[], rows: GraphRow[]): GraphBranchTargets[] {
  const byHash = new Map(commits.map(commit => [commit.hash, commit]))
  const owners = new Map<string, Map<string, GitBranchRef>>()
  for (const commit of commits) {
    for (const branch of commit.branches ?? []) {
      if (branch.kind === 'tag') continue
      let hash: string | undefined = commit.hash
      const visited = new Set<string>()
      while (hash && !visited.has(hash)) {
        visited.add(hash)
        const targets = owners.get(hash) ?? new Map<string, GitBranchRef>()
        targets.set(branch.ref, branch)
        owners.set(hash, targets)
        hash = byHash.get(hash)?.parents[0]
      }
    }
  }
  const targets = (hash: string | undefined) => [...(owners.get(hash ?? '')?.values() ?? [])]
  let active = new Map<number, string>()
  return rows.map((row, index) => {
    const commit = commits[index]
    const node = targets(commit.hash)
    const next = new Map<number, string>()
    let parentIndex = 0
    const edges = row.edges.map(edge => {
      const firstParent = edge.commit && parentIndex === 0
      const hash = edge.commit ? commit.parents[parentIndex++] : active.get(edge.from)
      if (hash) next.set(edge.to, hash)
      return firstParent && node.length ? node : targets(hash)
    })
    active = next
    return { node, edges }
  })
}
