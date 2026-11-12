const MAX_OUTPUT_LENGTH = 32_768
const MAX_URLS = 5
const MAX_CONCURRENT_CAPTURES = 4
const CAPTURE_TIMEOUT_MS = 800
const TOTAL_TIMEOUT_MS = 1_800

/** URLs printed by a command are hints, not proof that a service is still available. */
export function commandPreviewUrls(output: string): string[] {
  const result: string[] = []
  const text = output.slice(-MAX_OUTPUT_LENGTH).split('\x1b')
    .map((part, index) => index === 0 ? part : part.replace(/^\[[0-?]*[ -/]*[@-~]/, ' ')).join(' ')
  const candidates = (text.match(/\bhttps?:\/\/[^\s<>"']+/gi) ?? []).reverse()
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) continue
      if (!['localhost', '127.0.0.1', '[::1]', '0.0.0.0', '[::]'].includes(url.hostname)) continue
      if (url.hostname === '0.0.0.0' || url.hostname === '[::]') url.hostname = 'localhost'
      if (!result.includes(url.href)) result.push(url.href)
      if (result.length === MAX_URLS) break
    } catch { /* Output may contain incomplete URLs. */ }
  }
  return result
}

/** Bound each poll, isolate terminal failures and avoid returning raw terminal output. */
export async function addCommandPreviewUrls<T extends { session: string; running: boolean }>(
  buttons: T[], capture: (session: string, timeoutMs: number) => Promise<string>,
): Promise<Array<T & { previewUrls: string[] }>> {
  const result = buttons.map(button => ({ ...button, previewUrls: [] as string[] }))
  const deadline = Date.now() + TOTAL_TIMEOUT_MS
  let next = 0
  async function worker() {
    while (next < result.length && Date.now() < deadline) {
      const item = result[next++]
      if (!item.running) continue
      try { item.previewUrls = commandPreviewUrls(await capture(item.session, Math.min(CAPTURE_TIMEOUT_MS, Math.max(1, deadline - Date.now())))) }
      catch { /* A disappeared or unresponsive session must not block the menu. */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_CAPTURES, result.length) }, worker))
  return result
}
