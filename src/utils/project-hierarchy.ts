export interface ProjectHierarchyRow { path: string; parentPath: string | null; depth: number; index: number }

/** Keep personal order among siblings while placing descendants beneath their nearest project. */
export function projectHierarchy(paths: readonly string[]): ProjectHierarchyRow[] {
  const unique = [...new Set(paths)]
  const normalized = new Map(unique.map(path => [path, path.replace(/\\/g, '/').replace(/\/+$/, '') || '/']))
  const parents = new Map<string, string | null>()
  for (const current of unique) {
    const directory = normalized.get(current)!
    const ancestors = unique.filter(candidate => candidate !== current && directory.startsWith(`${normalized.get(candidate)!.replace(/\/$/, '')}/`))
    parents.set(current, ancestors.sort((a, b) => normalized.get(b)!.length - normalized.get(a)!.length)[0] ?? null)
  }
  const rows: ProjectHierarchyRow[] = []
  function append(parent: string | null, depth: number) {
    unique.forEach((path, index) => {
      if (parents.get(path) !== parent) return
      rows.push({ path, parentPath: parent, depth, index })
      append(path, depth + 1)
    })
  }
  append(null, 0)
  return rows
}
