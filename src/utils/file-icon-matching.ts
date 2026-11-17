export type IconAssociations = { fileNames: Record<string, string>; fileExtensions: Record<string, string> }
export type IconManifest = IconAssociations & { file: string; folder: string; folderExpanded: string; light: IconAssociations & Partial<{ file: string; folder: string; folderExpanded: string }> }

/** Resolve one prepared pack without importing another pack's associations. */
export function matchFileIcon(path: string, lightTheme: boolean, defaults: IconManifest): string {
  const light = defaults.light
  const fallback = (lightTheme ? light.file : undefined) ?? defaults.file
  const normalized = path.replaceAll('\\', '/').toLowerCase()
  const name = normalized.split('/').at(-1)!
  const exact = (table: Record<string, string>, key: string) => Object.hasOwn(table, key) ? table[key] : undefined
  const match = (kind: keyof IconAssociations, key: string) =>
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
  return fallback
}
