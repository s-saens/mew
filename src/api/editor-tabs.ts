import type { StoredTabs } from '../utils/editor-tab-state.ts'
import type { AccountEditorTabsSnapshot } from '../utils/account-editor-tabs.ts'
import { mewFetch } from '../utils/remote-transport.ts'
import { json } from './response.ts'

export function fetchAccountEditorTabs(workspacePath: string, signal?: AbortSignal): Promise<AccountEditorTabsSnapshot> {
  return mewFetch(`/api/user-ui/editor-tabs?workspace=${encodeURIComponent(workspacePath)}`, { signal })
    .then(json<AccountEditorTabsSnapshot>)
}

export function saveAccountEditorTabs(workspacePath: string, project: string, state: StoredTabs, initialize = false, signal?: AbortSignal): Promise<AccountEditorTabsSnapshot> {
  return mewFetch('/api/user-ui/editor-tabs', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ workspacePath, project, state, initialize }),
  }).then(json<AccountEditorTabsSnapshot>)
}
