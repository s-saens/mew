/** Automatic retries after the initial failure, before offering explicit recovery. */
export const AUTOMATIC_RETRY_LIMIT = 11

/** Recover safe agent reads and subscriptions promptly without busy-looping during an outage. */
export function agentRecoveryDelay(failures: number, interval: number) {
  return failures <= 0 ? interval : [0, 250, 500, 1000, 2000, 3000][Math.min(failures - 1, 5)]!
}
