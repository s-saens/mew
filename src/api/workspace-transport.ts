import { workspaceScopeUrl, type WorkspaceScope } from '../../shared/workspace-scope.ts'
import { mewFetch, mewUpload, openMewSocket } from '../utils/remote-transport.ts'
import { appResourceUrl, getAppRuntime, prepareAppResourceUrl } from '../runtime/app-runtime.ts'

/** Query parameters also work for DOM resources and WebSocket handshakes through Mewlink. */
export function scopedWorkspaceUrl(input: string, scope?: Readonly<WorkspaceScope>): string {
  if (!scope || /^(?:data|blob):/.test(input)) return input
  const base = typeof location === 'undefined' ? 'http://mew.local' : location.href || location.origin
  const url = new URL(input, base)
  if (!url.pathname.startsWith('/api/')) return input
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) && !(new URL(base).protocol === 'mew-app:' && url.protocol === 'mew-app:')) return input
  const sameHost = url.host === new URL(base).host
  if (!sameHost) return input
  return workspaceScopeUrl(input, scope)
}

export function createWorkspaceTransport(scope?: Readonly<WorkspaceScope>) {
  const scopedUrl = (url: string) => scopedWorkspaceUrl(url, scope)
  const fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (input instanceof Request) {
      const url = scopedUrl(input.url)
      return mewFetch(url === input.url ? input : new Request(url, input), init)
    }
    return mewFetch(scopedUrl(String(input)), init)
  }
  return {
    scopedUrl,
    fetch,
    upload: (url: string, body: FormData, onProgress: (percent: number) => void) => mewUpload(scopedUrl(url), body, onProgress),
    resourceUrl: (url: string) => appResourceUrl(scopedUrl(url)),
    prepareResourceUrl: (url: string, signal?: AbortSignal) => prepareAppResourceUrl(scopedUrl(url), signal),
    releaseResourceUrl: (url: string) => getAppRuntime().releaseResourceUrl?.(url),
    openSocket: (url: string | URL, protocols?: string | string[]) => openMewSocket(scopedUrl(String(url)), protocols),
  }
}
