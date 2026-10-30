import express from 'express'
import fs from 'node:fs'
import { authOf } from './reqAuth.ts'
import { DEFAULT_PROJECT } from './paths.ts'
import { protectFileResponse } from './file-response.ts'
import { remoteContext } from './remote-access-context.ts'
import { requestIp } from './change-ip.ts'
import { PublicShareError, getPublicShare, listPublicShares, openPublicShareRaw, publicShareInfo, publicShareTree, readPublicShareFile, setPublicShare, writePublicShareFile } from './public-shares.ts'

function projectOf(req: express.Request): string {
  const value = req.query.project ?? req.body?.project
  return typeof value === 'string' && value ? value : DEFAULT_PROJECT
}
function handle(res: express.Response, error: unknown): void {
  if (error instanceof PublicShareError) { res.status(error.status).json({ error: error.message, ...(error.code ? { code: error.code } : {}) }); return }
  const code = (error as NodeJS.ErrnoException).code
  res.status(['ENOENT', 'ENOTDIR'].includes(code ?? '') ? 404 : 400).json({ error: 'Public link or file is unavailable.' })
}
function retainConnection(req: express.Request): void {
  const { type, id } = req.params
  remoteContext(req)?.allowPublicShare?.(() => {
    try { publicShareInfo(type, id); return true } catch { return false }
  })
}

export function createPublicSharesRouter(): express.Router {
  const router = express.Router()
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    next()
  })
  router.get('/', (req, res) => {
    try { res.json({ share: getPublicShare(authOf(req), projectOf(req), req.query.path ?? '') }) } catch (error) { handle(res, error) }
  })
  router.get('/list', (req, res) => {
    try { res.json({ shares: listPublicShares(authOf(req), projectOf(req)) }) } catch (error) { handle(res, error) }
  })
  router.put('/', (req, res) => {
    try { res.json({ share: setPublicShare(authOf(req), projectOf(req), req.body?.path ?? '', req.body?.mode) }) } catch (error) { handle(res, error) }
  })
  router.get('/:type/:id', (req, res) => {
    try {
      const result = publicShareInfo(req.params.type, req.params.id)
      retainConnection(req)
      res.json(result)
    } catch (error) { handle(res, error) }
  })
  router.get('/:type/:id/tree', (req, res) => {
    try {
      const tree = publicShareTree(req.params.type, req.params.id, req.query.path ?? '')
      retainConnection(req)
      res.json({ tree })
    } catch (error) { handle(res, error) }
  })
  router.get('/:type/:id/file', (req, res) => {
    try {
      const file = readPublicShareFile(req.params.type, req.params.id, req.query.path ?? '')
      retainConnection(req)
      res.json(file)
    } catch (error) { handle(res, error) }
  })
  router.put('/:type/:id/file', (req, res) => {
    try {
      const file = writePublicShareFile(req.params.type, req.params.id, req.body?.path ?? '', req.body?.content, req.body?.baseVersion, requestIp(req))
      retainConnection(req)
      res.json(file)
    } catch (error) { handle(res, error) }
  })
  router.get('/:type/:id/raw', (req, res) => {
    try {
      const { descriptor, name, size } = openPublicShareRaw(req.params.type, req.params.id, req.query.path ?? '')
      retainConnection(req)
      protectFileResponse(res)
      res.type(name).setHeader('Content-Length', size)
      if (req.method === 'HEAD') { fs.closeSync(descriptor); res.end(); return }
      const stream = fs.createReadStream('', { fd: descriptor, autoClose: true })
      res.once('close', () => stream.destroy())
      stream.once('error', () => { if (!res.headersSent) handle(res, new PublicShareError('File unavailable.', 404)); else res.destroy() })
      stream.pipe(res)
    } catch (error) { handle(res, error) }
  })
  return router
}
