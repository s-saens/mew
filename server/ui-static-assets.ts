import express, { type RequestHandler } from 'express'
import { stat } from 'node:fs/promises'
import path from 'node:path'

const textTypes: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}

/** Negotiate build sidecars while leaving static validation, HEAD and identity ranges to Express. */
export function uiStaticAssets(directory: string): RequestHandler {
  const root = path.resolve(directory)
  const options = { immutable: true, maxAge: '30d', index: false } as const
  const identity = express.static(root, options)
  const encoded = express.static(root, {
    ...options,
    setHeaders(res, file) {
      res.setHeader('Content-Encoding', file.endsWith('.br') ? 'br' : 'gzip')
      res.setHeader('Content-Type', textTypes[path.extname(file.replace(/\.(?:br|gz)$/, ''))])
    },
  })
  return async (req, res, next) => {
    let pathname: string
    try { pathname = decodeURIComponent(req.path) } catch { identity(req, res, next); return }
    if (!textTypes[path.extname(pathname)] || !['GET', 'HEAD'].includes(req.method)) { identity(req, res, next); return }
    res.vary('Accept-Encoding')
    if (req.headers.range || pathname.includes('\\') || pathname.split('/').some(part => part.startsWith('.'))) { identity(req, res, next); return }
    const file = path.resolve(root, `.${pathname}`)
    if (!file.startsWith(root + path.sep)) { identity(req, res, next); return }
    const encoding = req.acceptsEncodings('br', 'gzip', 'identity')
    if (encoding !== 'br' && encoding !== 'gzip') { identity(req, res, next); return }
    const suffix = encoding === 'br' ? '.br' : '.gz'
    try {
      if (!(await stat(file + suffix)).isFile()) { identity(req, res, next); return }
    } catch { identity(req, res, next); return }
    const original = req.url
    const query = original.indexOf('?')
    req.url = query < 0 ? original + suffix : original.slice(0, query) + suffix + original.slice(query)
    encoded(req, res, error => {
      req.url = original
      if (error) { next(error); return }
      res.removeHeader('Content-Encoding')
      res.removeHeader('Content-Type')
      identity(req, res, next)
    })
  }
}
