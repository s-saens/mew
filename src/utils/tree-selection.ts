export type TreeSelectionItem = { path: string; type: 'file' | 'dir'; editable?: boolean }

export type TreeSelection = { paths: ReadonlySet<string>; anchor: string | null }

export function selectTreeItem(
  current: TreeSelection,
  ordered: readonly TreeSelectionItem[],
  path: string,
  modifiers: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean },
): TreeSelection {
  const additive = modifiers.ctrlKey || modifiers.metaKey
  if (modifiers.shiftKey) {
    const anchorIndex = current.anchor === null ? -1 : ordered.findIndex(item => item.path === current.anchor)
    const targetIndex = ordered.findIndex(item => item.path === path)
    const hasRange = anchorIndex !== -1 && targetIndex !== -1
    const range = hasRange
      ? ordered.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1).map(item => item.path)
      : [path]
    return {
      paths: new Set([...(additive ? current.paths : []), ...range]),
      anchor: hasRange ? current.anchor : path,
    }
  }
  if (additive) {
    const paths = new Set(current.paths)
    if (paths.has(path)) paths.delete(path)
    else paths.add(path)
    return { paths, anchor: path }
  }
  return { paths: new Set([path]), anchor: path }
}

export function topLevelTreeItems(items: readonly TreeSelectionItem[]): TreeSelectionItem[] {
  const unique = new Map<string, TreeSelectionItem>()
  for (const item of items) if (!unique.has(item.path)) unique.set(item.path, item)
  const directories = new Set([...unique.values()].filter(item => item.type === 'dir').map(item => item.path))
  return [...unique.values()].filter(item => {
    if (item.path !== '' && directories.has('')) return false
    for (let slash = item.path.lastIndexOf('/'); slash > -1; slash = item.path.lastIndexOf('/', slash - 1)) {
      if (directories.has(item.path.slice(0, slash))) return false
      if (slash === 0) break
    }
    return true
  })
}
