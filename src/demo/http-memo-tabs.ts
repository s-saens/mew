import type { MemoTab } from '../../shared/shared-memo.ts'
import { demoJson, requireMethod, type DemoHttpHandler } from './http.ts'

export const handleDemoMemoTabs: DemoHttpHandler = ({ store, request, url }) => {
  const route = url.pathname
  if (route !== '/api/memo-tabs' && !route.startsWith('/api/memo-tabs/')) return
  const tabs = store.getState<MemoTab[]>('memo-tabs', [])
  if (route === '/api/memo-tabs') {
    requireMethod(request, 'GET', 'POST')
    if (request.method === 'GET') return demoJson({ tabs, ownerId: store.authStatus().email })
    let number = 1
    while (tabs.some(tab => tab.name === `Memo ${number}`)) number++
    const tab = { id: crypto.randomUUID(), name: `Memo ${number}` }
    store.setState('memo-tabs', [...tabs, tab])
    return demoJson({ tab }, 201)
  }
  requireMethod(request, 'DELETE')
  const id = route.slice('/api/memo-tabs/'.length)
  if (!tabs.some(tab => tab.id === id)) return demoJson({ error: 'Memo tab not found' }, 404)
  store.setState('memo-tabs', tabs.filter(tab => tab.id !== id))
  return demoJson({ ok: true })
}
