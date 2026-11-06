import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import { BROWSER_DESKTOP_WS } from '../shared/browser-desktop.ts'

export interface BrowserLoginJob {
  id: string
  account: string
  job: string
  url: string
  expiresAt: number
}

const jobs = new Map<string, BrowserLoginJob>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const changes = new EventEmitter()
const LIFETIME = 8 * 60 * 60_000

export function onBrowserLoginClosed(listener: (job: BrowserLoginJob) => void) { changes.on('closed', listener) }

export function removeBrowserLoginJob(id: string): BrowserLoginJob | undefined {
  const record = jobs.get(id)
  if (!record) return
  jobs.delete(id); clearTimeout(timers.get(id)); timers.delete(id)
  changes.emit('closed', record)
  return record
}

export function browserLoginJob(id: string, account: string): BrowserLoginJob | undefined {
  const record = jobs.get(id)
  if (!record || record.account !== account) return
  if (record.expiresAt <= Date.now()) { removeBrowserLoginJob(id); return }
  return record
}

export function browserLoginJobs(account?: string, job?: string): BrowserLoginJob[] {
  return [...jobs.values()].filter(record => (account === undefined || record.account === account) && (job === undefined || record.job === job))
}

export function createBrowserLoginJob(account: string, job: string, url: string): BrowserLoginJob {
  const existing = browserLoginJobs(account, job)
  const reused = existing.find(record => record.url === url && record.expiresAt > Date.now())
  if (reused) return reused
  for (const record of existing) removeBrowserLoginJob(record.id)
  if (browserLoginJobs(account).length >= 32) throw new Error('열려 있는 브라우저 로그인 작업이 너무 많습니다. 사용하지 않는 창을 닫아 주세요.')
  const record = { id: crypto.randomBytes(24).toString('base64url'), account, job, url, expiresAt: Date.now() + LIFETIME }
  jobs.set(record.id, record)
  const timer = setTimeout(() => removeBrowserLoginJob(record.id), LIFETIME); timer.unref(); timers.set(record.id, timer)
  return record
}

export function browserLoginStream(record: BrowserLoginJob) { return `${BROWSER_DESKTOP_WS}?login=${record.id}` }
