import type { StoredTabs } from '../utils/editor-tab-state.ts'
import type { AccountEditorTabsSnapshot } from '../utils/account-editor-tabs.ts'
import { mewFetch } from '../utils/remote-transport.ts'
import { json } from './response.ts'

export function createEditorTabsClient(requestFetch: typeof mewFetch = mewFetch) {
  const scopedFetch = requestFetch

  function fetchAccountEditorTabs(workspacePath: string, signal?: AbortSignal): Promise<AccountEditorTabsSnapshot> {
    return scopedFetch(`/api/user-ui/editor-tabs?workspace=${encodeURIComponent(workspacePath)}`, { signal })
      .then(json<AccountEditorTabsSnapshot>)
  }

  function saveAccountEditorTabs(workspacePath: string, project: string, state: StoredTabs, initialize = false, signal?: AbortSignal): Promise<AccountEditorTabsSnapshot> {
    return scopedFetch('/api/user-ui/editor-tabs', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ workspacePath, project, state, initialize }),
    }).then(json<AccountEditorTabsSnapshot>)
  }
  return { fetchAccountEditorTabs, saveAccountEditorTabs }
}

export const { fetchAccountEditorTabs, saveAccountEditorTabs } = createEditorTabsClient()
