import { openMewSocket } from '../utils/remote-transport.ts'
import { useWorkspaceApi } from '../api/workspace-api-context'
import { isMemoProject } from '../../shared/shared-memo.ts'
import { connectCollab, type Collab } from '../utils/collab-connection.ts'
import { useEffect, useState } from 'react'

export type { Collab } from '../utils/collab-connection.ts'

// A null path disables collaboration. Editors own document seeding after synchronization.
export function useCollab(project: string, path: string | null, authEmail: string | null): Collab | null {
  const api = useWorkspaceApi()
  const scope = isMemoProject(project) ? undefined : api.scope
  const openSocket = isMemoProject(project) ? openMewSocket : api.openSocket
  const scopeKey = JSON.stringify(scope ?? null)
  const [state, setState] = useState<{
    collab: Collab
    project: string
    path: string
    authEmail: string | null
    scopeKey: string
  } | null>(null)

  useEffect(() => {
    if (!path) {
      setState(null)
      return
    }
    return connectCollab({ project, path, authEmail, scope, openSocket }, collab => {
      setState({ collab, project, path, authEmail, scopeKey })
    })
  }, [project, path, authEmail, openSocket, scope, scopeKey])

  return state && state.project === project && state.path === path && state.authEmail === authEmail && state.scopeKey === scopeKey
    ? state.collab : null
}
