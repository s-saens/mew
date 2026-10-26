import { EventEmitter } from 'node:events'
import { Worker } from 'node:worker_threads'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function rustLibrary(platform = process.platform) {
  return platform === 'win32' ? 'mew-desktop-engine.dll' : platform === 'darwin' ? 'libmew_desktop_engine.dylib' : 'libmew_desktop_engine.so'
}

/** JSON crosses this boundary only for control/diagnostics. Encoded frames and
 * RTP packets stay on the Rust thread from native GPU poll through SRTP send. */
export function rustEngine(koffi, directory = path.dirname(fileURLToPath(import.meta.url))) {
  const library = koffi.load(path.join(directory, rustLibrary()))
  if (library.func('int mew_engine_abi()')() !== 1) throw new Error('Rust 영상 모듈을 다시 준비해 주세요.')
  const create = library.func('void *mew_engine_create(const char *)')
  const command = library.func('int mew_engine_command(void *, const void *, int)')
  const event = library.func('int mew_engine_event(void *, void *, int)')
  const finished = library.func('int mew_engine_finished(void *)')
  const destroy = library.func('int mew_engine_destroy(void *)')
  let handle = create(directory)
  if (!handle) throw new Error('Rust 영상 스레드를 준비하지 못했습니다.')
  const worker = new EventEmitter(), buffer = Buffer.alloc(1024 * 1024)
  const cursor = process.platform === 'win32' ? new Worker(new URL('./cursor-worker.mjs', import.meta.url)) : undefined
  let session, negotiation, ended = false
  worker.threadId = 1
  cursor?.on('message', value => { if (value.session === session) worker.emit('message', value) })
  cursor?.on('error', error => worker.emit('error', error))
  worker.postMessage = value => {
    if (ended) return
    if (value.type === 'peer') { session = value.session; negotiation = value.negotiation }
    if (value.type === 'lease' && value.session !== session) return
    if (['stop', 'close-peer', 'close'].includes(value.type)) cursor?.postMessage({ type: 'stop' })
    const bytes = Buffer.from(JSON.stringify({ negotiation, ...value }))
    if (command(handle, bytes, bytes.length) !== 0) worker.emit('error', new Error('Rust 제어 대기열이 종료됐습니다.'))
  }
  const poll = () => {
    if (ended) return
    try {
      const done = finished(handle)
      for (let i = 0; i < 256; i++) {
        const length = event(handle, buffer, buffer.length)
        if (length < 0) throw new Error('잘못된 Rust 영상 이벤트입니다.')
        if (!length) break
        const value = JSON.parse(buffer.toString('utf8', 0, length))
        if (value.type === 'started') cursor?.postMessage({ type: 'start', session: value.session, screen: value.screen, fps: value.video.fps })
        worker.emit('message', value)
      }
      if (done) {
        ended = true; clearInterval(timer); cursor?.postMessage({ type: 'close' }); void cursor?.terminate()
        destroy(handle); handle = null; worker.threadId = -1; worker.emit('exit', 0)
      }
    } catch (error) { worker.postMessage({ type: 'close' }); worker.emit('error', error) }
  }
  const timer = setInterval(poll, 4)
  worker.terminate = () => {
    if (ended) return Promise.resolve()
    worker.postMessage({ type: 'close' })
    return new Promise((resolve, reject) => {
      const done = () => { clearTimeout(deadline); resolve() }
      const deadline = setTimeout(() => { worker.removeListener('exit', done); clearInterval(timer); void cursor?.terminate(); reject(new Error('Rust GPU 종료를 확인하지 못했습니다. 호스트를 다시 준비해 주세요.')) }, 1000)
      worker.once('exit', done)
    })
  }
  return worker
}
