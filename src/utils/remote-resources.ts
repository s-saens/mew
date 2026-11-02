import { activeRemoteTransport } from './remote-transport.ts'
import { fetchRemoteUiResource } from './remote-ui-cache.ts'

const RESOURCE_WORKER = '/remote-resource-worker.js'
const RESOURCE_PROTOCOL = 1

function currentResourceWorker(registration: ServiceWorkerRegistration | undefined, controller: ServiceWorker | null) {
  return !!controller && controller.state === 'activated' && controller.scriptURL === new URL(RESOURCE_WORKER, location.origin).href &&
    registration?.scope === new URL('/', location.origin).href && registration.active === controller && navigator.serviceWorker.controller === controller
}

function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const aborted = () => { signal.removeEventListener('abort', aborted); reject(signal.reason) }
    signal.addEventListener('abort', aborted, { once: true })
    promise.then(value => { signal.removeEventListener('abort', aborted); resolve(value) }, error => { signal.removeEventListener('abort', aborted); reject(error) })
  })
}

async function readyResourceWorker(signal: AbortSignal) {
  const controller = navigator.serviceWorker.controller
  if (!controller || controller.state !== 'activated' || controller.scriptURL !== new URL(RESOURCE_WORKER, location.origin).href) return false
  let registration: ServiceWorkerRegistration | undefined
  try { registration = await untilAborted(navigator.serviceWorker.getRegistration('/'), signal) } catch { signal.throwIfAborted(); return false }
  if (!currentResourceWorker(registration, controller)) return false
  return new Promise<boolean>(resolve => {
    const channel = new MessageChannel()
    const finish = (ready: boolean) => {
      clearTimeout(timer); signal.removeEventListener('abort', aborted)
      channel.port1.close(); channel.port2.close(); resolve(ready)
    }
    const aborted = () => finish(false)
    const timer = setTimeout(() => finish(false), 40)
    signal.addEventListener('abort', aborted, { once: true })
    channel.port1.onmessage = ({ data }) => finish(data?.type === 'mew-resource-ready' && data.protocol === RESOURCE_PROTOCOL && currentResourceWorker(registration, controller))
    try { controller.postMessage({ type: 'mew-resource-ready', protocol: RESOURCE_PROTOCOL }, [channel.port2]) } catch { finish(false) }
  })
}

function waitForResourceController(registration: ServiceWorkerRegistration, signal: AbortSignal) {
  if (currentResourceWorker(registration, navigator.serviceWorker.controller)) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const workers = new Set<ServiceWorker>()
    const finish = (error?: unknown) => {
      clearTimeout(timer); navigator.serviceWorker.removeEventListener('controllerchange', changed); signal.removeEventListener('abort', aborted)
      for (const worker of workers) worker.removeEventListener('statechange', changed)
      if (error) reject(error); else resolve()
    }
    const changed = () => {
      const controller = navigator.serviceWorker.controller
      if (controller && !workers.has(controller)) { workers.add(controller); controller.addEventListener('statechange', changed) }
      if (currentResourceWorker(registration, controller)) finish()
    }
    const aborted = () => finish(signal.reason)
    const timer = setTimeout(() => finish(new Error('파일 미리보기를 준비하지 못했습니다.')), 5000)
    navigator.serviceWorker.addEventListener('controllerchange', changed)
    signal.addEventListener('abort', aborted, { once: true })
    changed()
  })
}

export async function enableRemoteResources(options: { centralOrigin?: string; instance?: string; previewDomain?: string; onError?: (error: Error) => void } = {}) {
  if (!('serviceWorker' in navigator)) throw new Error('이 브라우저는 원격 파일 미리보기를 지원하지 않습니다.')
  const cleanup = new AbortController()
  const dispose = () => {
    navigator.serviceWorker.removeEventListener('message', onMessage); window.removeEventListener('pagehide', dispose)
    cleanup.abort(new DOMException('파일 미리보기 준비가 취소됐습니다.', 'AbortError'))
  }
  const onMessage = (event: MessageEvent) => {
    if (event.data?.type !== 'mew-resource' || !event.ports[0] || event.source !== navigator.serviceWorker.controller) return
    const transport = activeRemoteTransport(), port = event.ports[0], abort = new AbortController()
    if (!transport) { port.postMessage({ type: 'error' }); port.close(); return }
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, reading = false
    const close = () => { abort.abort(); void reader?.cancel().catch(() => {}); port.close() }
    port.onmessage = ({ data }) => {
      if (data.type === 'cancel') { close(); return }
      if (data.type !== 'pull' || reading || !reader) return
      reading = true
      void reader.read().then(result => { if (result.done) { port.postMessage({ type: 'end' }); close() } else { const bytes = result.value.slice().buffer; port.postMessage({ type: 'chunk', bytes }, [bytes]) } }).catch(() => { port.postMessage({ type: 'error' }); close() }).finally(() => { reading = false })
    }
    void fetchRemoteUiResource(transport, event.data.path, { method: event.data.method, headers: event.data.headers, signal: abort.signal }, options.instance).then(response => {
      if ([403, 404, 409].includes(response.status) && new URL(event.data.path, location.origin).searchParams.get('path') === '/index.html') options.onError?.(new Error('로컬 mew를 업데이트하고 빌드한 뒤 다시 연결해 주세요.'))
      reader = response.body?.getReader()
      port.postMessage({ type: 'response', status: response.status, headers: [...response.headers], centralOrigin: options.centralOrigin, previewDomain: options.previewDomain })
      if (!reader) { port.postMessage({ type: 'end' }); close() }
    }).catch(() => { port.postMessage({ type: 'error' }); close() })
  }
  navigator.serviceWorker.addEventListener('message', onMessage)
  window.addEventListener('pagehide', dispose, { once: true })
  try {
    if (await readyResourceWorker(cleanup.signal)) {
      cleanup.signal.throwIfAborted()
      // A compatible active worker can serve this tab while its public script checks for updates.
      void Promise.resolve().then(() => navigator.serviceWorker.register(RESOURCE_WORKER, { scope: '/' })).catch(() => {})
    } else {
      cleanup.signal.throwIfAborted()
      const registration = await untilAborted(navigator.serviceWorker.register(RESOURCE_WORKER, { scope: '/' }), cleanup.signal)
      await untilAborted(navigator.serviceWorker.ready, cleanup.signal)
      cleanup.signal.throwIfAborted()
      await waitForResourceController(registration, cleanup.signal)
    }
  } catch (error) { dispose(); throw error }
  return dispose
}
