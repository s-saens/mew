import { WebSocket } from 'ws'

const HEARTBEAT = '{"type":"heartbeat"}'

export function watchRemoteHeartbeat(socket: WebSocket) {
  let received = performance.now(), stopped = false
  const opened = () => { received = performance.now() }
  const message = (raw: { toString(): string }) => { if (raw.toString() === HEARTBEAT) received = performance.now() }
  const timer = setInterval(() => {
    if (performance.now() - received >= 60_000) { socket.terminate(); return }
    if (socket.readyState !== WebSocket.OPEN) return
    try { socket.send(HEARTBEAT, error => { if (error && !stopped) socket.terminate() }) }
    catch { socket.terminate() }
  }, 20_000)
  timer.unref()
  const stop = () => {
    stopped = true; clearInterval(timer)
    socket.off('open', opened); socket.off('message', message); socket.off('close', stop)
  }
  socket.on('open', opened)
  socket.on('message', message)
  socket.once('close', stop)
  return stop
}
