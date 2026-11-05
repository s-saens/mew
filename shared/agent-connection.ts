export const AGENT_CONNECTION_PROBE_MAX_ID_LENGTH = 100

export type AgentConnectionReady = { type: 'ready'; cwd: string; connectionProbe?: boolean; sessionHistoryPreviews?: boolean }
export type AgentConnectionPing = { type: 'ping'; id: string }
export type AgentConnectionPong = { type: 'pong'; id: string }

export function validAgentConnectionProbeId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= AGENT_CONNECTION_PROBE_MAX_ID_LENGTH
}
