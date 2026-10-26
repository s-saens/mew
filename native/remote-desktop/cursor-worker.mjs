import { parentPort } from 'node:worker_threads'
import koffi from 'koffi'
import { windowsCursor } from './cursor-windows.mjs'
import { cursorPng } from './cursor-png.mjs'

const user = koffi.load('user32.dll'), getDC = user.func('void *GetDC(void *)'), releaseDC = user.func('int ReleaseDC(void *, void *)')
let dc, timer, session, last = ''
const stop = () => { clearInterval(timer); if (dc) releaseDC(null, dc); dc = undefined; session = undefined; last = '' }
parentPort.on('message', message => {
  try {
    if (message.type === 'start') {
      stop(); session = message.session; dc = getDC(null)
      const cursor = windowsCursor(koffi, dc, message.screen)
      const poll = () => {
        try {
          const value = cursor(), identity = JSON.stringify({ ...value, shape: undefined })
          if (identity !== last || value.shape) {
            if (value.shape) value.shape = { ...value.shape, pixels: undefined, png: cursorPng(value.shape) }
            parentPort.postMessage({ type: 'cursor', session, value }); last = identity
          }
        } catch (error) { const id = session; stop(); parentPort.postMessage({ type: 'error', session: id, message: error.message }) }
      }
      timer = setInterval(poll, Math.max(8, Math.ceil(1000 / Math.min(message.fps, 120)))); poll()
    } else if (message.type === 'stop') stop()
    else if (message.type === 'close') { stop(); parentPort.close() }
  } catch (error) { const id = session; stop(); parentPort.postMessage({ type: 'error', session: id, message: error.message }) }
})
