export function parsePublicSharePath(path: string): { type: 'f' | 'd'; id: string } | null {
  const match = /^\/share\/(f|d)\/([A-Za-z0-9_-]{43})\/?$/.exec(path)
  return match ? { type: match[1] as 'f' | 'd', id: match[2]! } : null
}

export function appRoute(path: string, basePath = '/'): 'workspace' | 'share' | 'not-found' {
  if (path === basePath || basePath === '/' && path === '/index.html') return 'workspace'
  return parsePublicSharePath(path) ? 'share' : 'not-found'
}
