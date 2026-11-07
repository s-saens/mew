import type { MemoTab } from '../../shared/shared-memo'
import { mewFetch } from '../utils/remote-transport'
import { json } from './response'

export const fetchMemoTabs = () => mewFetch('/api/memo-tabs').then(json<{ tabs: MemoTab[]; ownerId: string }>)
export const createMemoTab = () => mewFetch('/api/memo-tabs', { method: 'POST' }).then(json<{ tab: MemoTab }>)
export const deleteMemoTab = (id: string) => mewFetch(`/api/memo-tabs/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(json<{ ok: true }>)
