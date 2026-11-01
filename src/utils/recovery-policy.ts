/** Automatic retries after the initial failure, before offering explicit recovery. */
export const AUTOMATIC_RETRY_LIMIT = 11

/** Keep safe agent reads and subscriptions retrying, with slower attempts after the fast recovery window. */
export function agentRecoveryDelay(failures: number, interval: number) {
  return Math.min(30_000, interval * 2 ** Math.min(Math.max(0, failures - AUTOMATIC_RETRY_LIMIT), 5))
}
