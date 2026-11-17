/** Decode out-of-band terminal socket messages without treating ordinary output as commands. */
export function terminalBrowserOpenMessage(data: string): { url: string | null } | null {
  if (!data.startsWith('\0')) return null
  try {
    const message: unknown = JSON.parse(data.slice(1))
    if (!message || typeof message !== 'object' || !('type' in message) || message.type !== 'browser-open') return null
    if (!('url' in message) || typeof message.url !== 'string' || message.url.length > 8192) return { url: null }
    try {
      const url = new URL(message.url)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return { url: null }
      return { url: url.href }
    } catch { return { url: null } }
  } catch { return null }
}

export function createTerminalSocketDecoder() {
  const decoder = new TextDecoder()
  let binaryProtocol = false
  return (data: unknown): { output?: string; browserUrl?: string } => {
    if (data instanceof ArrayBuffer) {
      const output = decoder.decode(data, { stream: true })
      if (!binaryProtocol && output === 'mew-terminal-v2') { binaryProtocol = true; return {} }
      return { output }
    }
    if (typeof data !== 'string') return {}
    if (!binaryProtocol) return { output: data }
    const request = terminalBrowserOpenMessage(data)
    return request?.url ? { browserUrl: request.url } : {}
  }
}
