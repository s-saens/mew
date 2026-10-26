export const REMOTE_UI_REVALIDATION_HEADER = 'x-mew-ui-revisions'
export const REMOTE_UI_REVALIDATION_LIMIT = 64
export const REMOTE_UI_REVALIDATION_QUERY_LIMIT = 6144
export const REMOTE_UI_REVALIDATION_AGE = 1000

export function remoteUiCachePath(path: unknown): path is string {
  return typeof path === 'string' && path.length <= 1024
    && (/^\/assets\/[A-Za-z0-9_./-]+\.(?:js|mjs|css|woff2?|ttf|otf|wasm)$/i.test(path)
      || /^\/fonts\/[A-Za-z0-9_./-]+\.(?:css|woff2?|ttf|otf)$/i.test(path))
    && !path.split('/').some(part => part.startsWith('.'))
}
