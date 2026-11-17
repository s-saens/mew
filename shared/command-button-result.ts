export type CommandButtonResult = {
  command: string
  state: 'running' | 'completed' | 'failed' | 'interrupted'
  exitCode: number | null
  error?: string
  previewTruncated?: boolean
  archived?: boolean
  text?: string
}
