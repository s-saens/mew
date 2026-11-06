import { createContext, useContext, type ReactNode } from 'react'
import { workspaceClient, type WorkspaceClient } from './client.ts'

const WorkspaceApiContext = createContext<WorkspaceClient>(workspaceClient)

/** Hosts own stable clients; changing focused panels never changes another host's provider. */
export function WorkspaceApiProvider({ client, children }: { client: WorkspaceClient; children: ReactNode }) {
  return <WorkspaceApiContext.Provider value={client}>{children}</WorkspaceApiContext.Provider>
}

export function useWorkspaceApi(): WorkspaceClient {
  return useContext(WorkspaceApiContext)
}
