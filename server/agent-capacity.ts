import { accessIssueFromError } from '../shared/agent-access.ts'

const capacityMessage = /(?:selected |the )?model (?:is (?:currently )?|has reached (?:its )?)(?:at capacity|overloaded|capacity)|(?:the )?(?:server|service) is (?:currently )?overloaded|temporarily unavailable due to (?:high|increased) demand/i
const capacityCode = /\b(?:overloaded_error|server_overloaded|model_overloaded|model_capacity_exceeded)\b/i
const credentialsError = /invalid (?:api[- ]?key|credentials|token)|unauthorized|not logged in|please (?:log in|sign in)|(?:authentication|authorization) failed|(?:expired|revoked) (?:access )?token/i

/** Generic 429s, billing limits and authentication failures are not capacity signals. */
export function isModelCapacityError(error: unknown): boolean {
  if (accessIssueFromError(error)) return false
  const record = error && typeof error === 'object' ? error as { message?: unknown; data?: unknown } : null
  const message = typeof record?.message === 'string' ? record.message : typeof error === 'string' ? error : ''
  let details = ''
  try { details = record?.data ? JSON.stringify(record.data) : '' } catch { /* Ignore circular local error metadata. */ }
  const text = `${message} ${details}`.slice(0, 16_000)
  return !credentialsError.test(text) && (capacityMessage.test(text) || capacityCode.test(text))
}

/** Codex ACP can report terminal provider errors as ordinary assistant text. */
function standaloneTerminalCapacityMessage(text: string): string | null {
  const lastLine = text.trim().split(/\n/).at(-1)?.trim() ?? ''
  // Match a standalone provider failure, not an explanation quoting a capacity error.
  if (!/^(?:(?:selected |the )?model |(?:the )?(?:server|service) (?:is |temporarily ))/i.test(lastLine)) return null
  if (!isModelCapacityError(lastLine)) return null
  if (!/^(?:(?:selected |the )?model (?:is (?:currently )?|has reached (?:its )?)(?:at capacity|overloaded|capacity)|(?:the )?(?:server|service) is (?:currently )?overloaded|(?:the )?service temporarily unavailable due to (?:high|increased) demand)[.!]?(?:\s+Please (?:try (?:a different model|again(?: later)?)|retry(?: later)?)[.!]?)?$/i.test(lastLine)) return null
  return lastLine
}

export function terminalCapacityMessage(text: string, chunks: readonly string[] = []): string | null {
  const message = standaloneTerminalCapacityMessage(text)
  if (message) return message
  // A provider error can begin a new ACP chunk directly after prior assistant text,
  // without inserting a newline. Preserve boundaries, including split error chunks.
  let suffix = ''
  for (let index = chunks.length - 1; index >= 0; index--) {
    suffix = chunks[index] + suffix
    if (suffix.length > 512) break
    const terminal = standaloneTerminalCapacityMessage(suffix)
    if (terminal) return terminal
  }
  return null
}

export const capacityContinuationPrompt = '모델의 일시적인 용량 부족으로 중단된 작업을 이어서 진행하세요. 이전 대화와 현재 파일 상태를 확인하고 이미 완료한 작업이나 도구 실행은 반복하지 말고 남은 작업을 완료하세요.'

export function waitForCapacityRetry(milliseconds: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false)
  return new Promise(resolve => {
    const finish = (ready: boolean) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', aborted)
      resolve(ready)
    }
    const aborted = () => finish(false)
    const timer = setTimeout(() => finish(true), milliseconds)
    signal.addEventListener('abort', aborted, { once: true })
  })
}
