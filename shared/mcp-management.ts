import type { SharedMcpConnectionStatus } from './shared-mcp.ts'

export type McpUsageScope = 'common' | 'project'

export interface McpManagementRevision {
  registry: string
  common: string
  project: string
}

/** Project null inherits the installation preference; a group gates its members. */
export interface McpUsageState {
  common: boolean
  project: boolean | null
  enabled: boolean
}

export interface McpManagedServer {
  name: string
  endpoint: string
  transport: 'http' | 'sse' | 'stdio'
  groupId: string | null
  inferredGroup: boolean
  usage: McpUsageState
  effectiveEnabled: boolean
  connection?: Pick<SharedMcpConnectionStatus, 'status' | 'error'>
}

export interface McpManagedGroup {
  id: string
  name: string
  suggested: boolean
  usage: McpUsageState
  members: string[]
  enabledCount: number
}

export interface McpCloudflarePreview {
  url: string
  existingUnified: string | null
  suggestedName: string
  candidates: Array<{ name: string; endpoint: string; unified: boolean; effectiveEnabled: boolean }>
}

export interface McpManagementInventory {
  canManage?: boolean
  revision: McpManagementRevision
  projectRoot: string
  servers: McpManagedServer[]
  groups: McpManagedGroup[]
  cloudflare: McpCloudflarePreview
}

interface McpMutationBase {
  cwd: string
  revision: McpManagementRevision
}

export type McpManagementMutation = McpMutationBase & (
  | { action: 'usage'; scope: McpUsageScope; target: 'server' | 'group'; id: string; enabled: boolean | null }
  | { action: 'create-server'; scope: McpUsageScope; name: string; content: string }
  | { action: 'create-group'; name: string; members?: string[] }
  | { action: 'rename-group'; id: string; name: string }
  | { action: 'remove-group'; id: string }
  | { action: 'assign'; names: string[]; groupId: string | null }
  | { action: 'consolidate-cloudflare'; name: string; disable: string[]; scope: McpUsageScope }
)
