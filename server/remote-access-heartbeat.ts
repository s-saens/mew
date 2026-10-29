import { WebSocket } from 'ws'

const HEARTBEAT = '{"type":"heartbeat"}'
const REPLY_TIMEOUT = 5_000

export function watchRemoteHeartbeat(socket: WebSocket) {
  let stopped = false, pending = false, generation = 0
  let replyTimer: ReturnType<typeof setTimeout> | undefined
  const message = (raw: { toString(): string }) => {
    if (raw.toString() !== HEARTBEAT) return
    pending = false; generation++; clearTimeout(replyTimer); replyTimer = undefined
  }
  function stop() {
    stopped = true; generation++; clearInterval(timer); clearTimeout(replyTimer)
    socket.off('message', message); socket.off('close', stop)
  }
  function terminate() { stop(); socket.terminate() }
  function heartbeat(repeated = false) {
    if (stopped || socket.readyState !== WebSocket.OPEN) return
    pending = true
    const current = ++generation, deadline = performance.now() + REPLY_TIMEOUT
    const check = () => {
      if (stopped || current !== generation) return
      const remaining = deadline - performance.now()
      if (remaining > 0) { replyTimer = setTimeout(check, remaining); replyTimer.unref(); return }
      if (repeated) terminate()
      else heartbeat(true)
    }
    replyTimer = setTimeout(check, REPLY_TIMEOUT); replyTimer.unref()
    try { socket.send(HEARTBEAT, error => { if (error && !stopped && current === generation) terminate() }) }
    catch { if (!stopped && current === generation) terminate() }
  }
  const timer = setInterval(() => {
    if (!pending) heartbeat()
  }, 20_000)
  timer.unref()
  socket.on('message', message)
  socket.once('close', stop)
  return stop
}
