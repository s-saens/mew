import { createContext, useContext } from 'react'

export interface ProjectSetupRequest {
  projectPath: string
  projectName: string
  setupTitle: string
  onClose?: () => void
}

export const ProjectSetupContext = createContext<((request: ProjectSetupRequest) => void) | null>(null)

export function useProjectSetup() { return useContext(ProjectSetupContext) }
