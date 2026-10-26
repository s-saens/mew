export function remoteHostRetryDelay(attempt: number, jitter = Math.random()) {
  return Math.min(30_000, 100 * 2 ** Math.min(Math.max(0, attempt), 9) * (0.75 + Math.max(0, Math.min(1, jitter)) / 2))
}
