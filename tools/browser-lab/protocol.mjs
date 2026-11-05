export const INITIAL_URL = 'https://www.scrapingcourse.com/cloudflare-challenge'
export const ENGINES = [
  { id: 'chrome', name: 'Chrome', port: 5600 },
  { id: 'shell', name: 'Headless Shell', port: 5601 },
  { id: 'moli', name: 'Moli', port: 5602 },
  { id: 'obscura', name: 'Obscura', port: 5603 },
  { id: 'lightpanda', name: 'Lightpanda', port: 5604 },
  { id: 'wpe', name: 'WPE WebKit', port: 5605 },
]

export function viewerHostnames(value = []) {
  if (!Array.isArray(value)) throw new Error('viewerHosts must be an array of hostnames')
  return value.map(host => {
    if (typeof host !== 'string') throw new Error('viewerHosts must contain hostnames only')
    const url = new URL(`http://${host}`)
    if (url.host !== host.toLowerCase() || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.port) throw new Error('viewerHosts must contain hostnames without ports or paths')
    return url.hostname
  })
}

export function navigationTarget(value, viewerHosts = []) {
  if (typeof value !== 'string' || value.length > 8192) throw new Error('웹 주소가 너무 깁니다.')
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('로그인 정보가 포함되지 않은 HTTP(S) 주소를 입력해 주세요.')
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (['localhost', '127.0.0.1', '::1', ...viewerHosts].includes(hostname) && ENGINES.some(engine => String(engine.port) === url.port)) {
    throw new Error('비교 화면 자신을 브라우저 안에서 열 수 없습니다.')
  }
  return url.href
}

export function parseCommand(raw, viewport = { width: 1280, height: 800 }) {
  if (Buffer.byteLength(raw) > 24 * 1024) throw new Error('입력 크기가 너무 큽니다.')
  const value = JSON.parse(String(raw))
  if (!value || typeof value !== 'object') throw new Error('잘못된 입력입니다.')
  const coordinate = () => Number.isFinite(value.x) && Number.isFinite(value.y)
    && value.x >= 0 && value.y >= 0 && value.x <= viewport.width && value.y <= viewport.height
  if (value.type === 'navigate') return { type: value.type, url: navigationTarget(value.url, viewport.viewerHosts) }
  if (['back', 'forward', 'reload', 'restart'].includes(value.type)) return { type: value.type }
  if (value.type === 'resize' && Number.isInteger(value.width) && Number.isInteger(value.height)
    && value.width >= 320 && value.width <= 3840 && value.height >= 240 && value.height <= 2160) return value
  if (value.type === 'pointer' && coordinate() && ['move', 'down', 'up'].includes(value.action)
    && ['left', 'middle', 'right'].includes(value.button)
    && [1, 2].includes(value.clickCount ?? 1)) return value
  if (value.type === 'wheel' && coordinate() && [value.deltaX, value.deltaY].every(n => Number.isFinite(n) && Math.abs(n) <= 10000)) return value
  if (value.type === 'text' && typeof value.text === 'string' && value.text.length <= 16384) return value
  if (value.type === 'key' && typeof value.key === 'string' && value.key.length > 0 && value.key.length <= 64
    && ['ctrlKey', 'altKey', 'metaKey', 'shiftKey'].every(key => value[key] === undefined || typeof value[key] === 'boolean')) return value
  throw new Error('지원하지 않거나 범위를 벗어난 입력입니다.')
}
