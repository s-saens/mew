export type AgentCapacityRetrySettings = {
  delaySeconds: number
  maxRetries: number
}

export const defaultAgentCapacityRetrySettings: AgentCapacityRetrySettings = { delaySeconds: 30, maxRetries: 20 }

export function agentCapacityRetryValidationError(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== 2 || !Object.hasOwn(value, 'delaySeconds') || !Object.hasOwn(value, 'maxRetries')) return '올바른 모델 혼잡 재시도 설정을 입력하세요.'
  const settings = value as AgentCapacityRetrySettings
  if (!Number.isInteger(settings.delaySeconds) || settings.delaySeconds < 1 || settings.delaySeconds > 3600) return '재시도 간격은 1~3,600초 사이의 정수로 입력하세요.'
  if (!Number.isInteger(settings.maxRetries) || settings.maxRetries < 0 || settings.maxRetries > 100) return '재시도 횟수는 0~100 사이의 정수로 입력하세요.'
}

export function agentCapacityRetryMetadata(value: AgentCapacityRetrySettings): string {
  return `<!-- mew:agent-capacity-retry:v1 ${JSON.stringify(value)} -->`
}
