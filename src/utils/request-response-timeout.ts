/** Limit the pre-response wait for long-running speech inference on each transport. */
export function requestResponseTimeout(method: string, path: string): number {
  return method === 'POST' && path.split('?', 1)[0] === '/api/speech/transcribe' ? 310_000 : 30_000
}
