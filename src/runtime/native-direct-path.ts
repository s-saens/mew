const LOCAL_BASE = 'mew-app://workspace/'

/** The bridge takes paths only; a page cannot choose another native network destination. */
export function nativeDirectPath(input: string, socket = false): string {
  if (input.length > 8192 || /[\\\r\n#]/.test(input) || /%(?:00|0d|0a)/i.test(input) || /(?:^|\/)(?:\.|%2e)+(?:\/|$)/i.test(input.split('?')[0])) throw new TypeError('Invalid native request path')
  const url = new URL(input, LOCAL_BASE)
  if (url.username || url.password || url.host !== 'workspace' || !(socket ? ['mew-app:', 'ws:', 'wss:'] : ['mew-app:']).includes(url.protocol)) throw new TypeError('Foreign native request origin')
  if (!url.pathname.startsWith('/api/') || /%(?:2f|5c)/i.test(url.pathname) || url.pathname.split('/').some(part => decodeURIComponent(part).startsWith('.'))) throw new TypeError('Invalid native API path')
  if (socket && !['/api/tmux/ws', '/api/agent/ws', '/api/presence', '/api/live/ws', '/api/collab', '/api/db/ws', '/api/browser-desktop/ws', '/api/dom-browser/ws'].includes(url.pathname)) throw new TypeError('Unsupported native socket path')
  return url.pathname + url.search
}

export function nativeResourceUrl(input: string): string {
  if (/^(?:data|blob):/.test(input)) return input
  try { return new URL(nativeDirectPath(input), LOCAL_BASE).href } catch { return input }
}
