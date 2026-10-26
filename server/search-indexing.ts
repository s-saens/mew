import type { RequestHandler } from 'express'

/** Workspace responses stay out of search results, including guest-visible files. */
export const workspaceSearchPolicy: RequestHandler = (req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  if (req.path === '/robots.txt' && (req.method === 'GET' || req.method === 'HEAD')) {
    res.setHeader('Cache-Control', 'no-cache')
    res.type('text/plain').send('User-agent: *\nAllow: /\n')
    return
  }
  next()
}
