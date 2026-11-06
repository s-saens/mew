import crypto from 'node:crypto'
import express from 'express'
import { authOf, requireAuthenticated, requireFeature } from './reqAuth.ts'
import { closeBrowserLoginView } from './browser-desktop.ts'
import { browserLoginJob, browserLoginJobs, browserLoginStream, createBrowserLoginJob, removeBrowserLoginJob } from './browser-login-jobs.ts'
import type { LoginDesktopPage } from '../shared/login-desktop.ts'

export { browserDesktopExecutable as loginDesktopExecutable } from './browser-native-runtime.ts'

export function loginDesktopUrlAllowed(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length > 8192) return false
  try {
    const url = new URL(raw)
    return !url.username && !url.password && !url.port && url.protocol === 'https:' && ['accounts.google.com', 'antigravity.google', 'claude.ai', 'console.anthropic.com', 'platform.claude.com', 'auth.openai.com', 'platform.openai.com', 'chatgpt.com', 'kimi.com', 'www.kimi.com', 'kimi.ai', 'www.kimi.ai', 'cursor.com', 'www.cursor.com', 'authenticator.cursor.sh', 'github.com'].includes(url.hostname)
  } catch { return false }
}

function validAuthUrl(raw: string) {
  if (raw.length > 8192) return false
  try {
    const url = new URL(raw)
    return !url.username && !url.password && (url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  } catch { return false }
}


function page(record: ReturnType<typeof createBrowserLoginJob>): LoginDesktopPage {
  return { id: record.id, job: record.job, url: record.url, streamUrl: browserLoginStream(record) }
}

/** Login jobs select a URL in the same account browser; they do not own a second renderer. */
export async function createLoginDesktopAuthSession(account: string, job: string, url: string): Promise<string> {
  if (!account || !job || !validAuthUrl(url)) throw new Error('로그인 작업 정보가 올바르지 않습니다.')
  if (process.platform !== 'linux') throw new Error('브라우저 가상 화면은 현재 Linux/WSL에서 지원합니다.')
  return browserLoginStream(createBrowserLoginJob(account, job, new URL(url).href))
}

export async function closeLoginDesktopJob(account: string, job: string) {
  const records = browserLoginJobs(account, job)
  for (const record of records) removeBrowserLoginJob(record.id)
  await Promise.all(records.map(record => closeBrowserLoginView(account, record.id)))
}

export async function closeLoginDesktops() {
  const records = browserLoginJobs()
  for (const record of records) removeBrowserLoginJob(record.id)
  await Promise.all(records.map(record => closeBrowserLoginView(record.account, record.id)))
}

export function createLoginDesktopRoutes() {
  const app = express()
  app.post('/', requireFeature('nativeBrowser'), async (req, res) => {
    try {
      const account = authOf(req).email ?? '', url = req.body?.url
      if (!loginDesktopUrlAllowed(url)) { res.status(400).json({ error: '등록된 로그인·계정 관리 주소만 열 수 있습니다.' }); return }
      const canonical = new URL(url).href
      const existing = browserLoginJobs(account).find(record => record.url === canonical && record.expiresAt > Date.now())
      const stream = await createLoginDesktopAuthSession(account, existing?.job ?? crypto.randomUUID(), url)
      const record = browserLoginJob(new URL(stream, 'http://localhost').searchParams.get('login')!, account)!
      res.json(page(record))
    } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : '브라우저를 준비하지 못했습니다.' }) }
  })
  app.delete('/:id', requireAuthenticated, async (req, res) => {
    const account = authOf(req).email ?? '', id = String(req.params.id)
    const record = browserLoginJobs().find(record => record.id === id)
    if (record && record.account !== account) { res.sendStatus(403); return }
    removeBrowserLoginJob(record?.id ?? '')
    await closeBrowserLoginView(account, id)
    res.json({ ok: true })
  })
  return app
}
