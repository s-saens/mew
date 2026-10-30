import manifest from './file-icon-manifest.json' with { type: 'json' }

type Associations = { fileNames: Record<string, string>; fileExtensions: Record<string, string> }
const defaults: Associations = manifest
const light: Associations = manifest.light

export function folderIconId(open = false): string {
  return open ? manifest.folderExpanded : manifest.folder
}

export function fileIconId(path: string, lightTheme = false): string {
  const normalized = path.replaceAll('\\', '/').toLowerCase()
  const name = normalized.split('/').at(-1)!
  const exact = (table: Record<string, string>, key: string) => Object.hasOwn(table, key) ? table[key] : undefined
  const match = (kind: keyof Associations, key: string) =>
    (lightTheme ? exact(light[kind], key) : undefined) ?? exact(defaults[kind], key)
  for (let start = 0; start <= normalized.length;) {
    const named = match('fileNames', normalized.slice(start))
    if (named) return named
    const slash = normalized.indexOf('/', start)
    if (slash === -1) break
    start = slash + 1
  }
  for (let dot = name.indexOf('.'); dot !== -1; dot = name.indexOf('.', dot + 1)) {
    const extension = match('fileExtensions', name.slice(dot + 1))
    if (extension) return extension
  }
  return manifest.file
}
