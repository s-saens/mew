/** Safe browser-facing connection state. Credentials and authorization URLs stay on the host. */
export interface SharedMcpConnectionStatus {
  name: string
  status: 'disconnected' | 'connecting' | 'needs_auth' | 'connected' | 'error'
  error?: string
  streamUrl?: string
  ownsJob?: boolean
}
