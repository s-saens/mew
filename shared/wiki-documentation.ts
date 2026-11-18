export const wikiDocumentationRoots = ['.mew/wiki', '.mew/docs', 'wiki'] as const

export function isWikiDocumentationPath(projectRelativePath: string): boolean {
  return wikiDocumentationRoots.some(root => projectRelativePath === root || projectRelativePath.startsWith(`${root}/`))
}
