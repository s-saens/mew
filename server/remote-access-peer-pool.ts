import type { ChildProcess } from 'node:child_process'

/** A stuck native cleanup must not keep a retired connection alive forever. */
export function closeRemotePeer(peer: ChildProcess) {
  if (peer.exitCode !== null || peer.signalCode != null) return
  const exited = () => { clearTimeout(timer) }
  const timer = setTimeout(() => {
    peer.removeListener('exit', exited)
    if (peer.exitCode === null && peer.signalCode == null) peer.kill('SIGKILL')
  }, 4000)
  timer.unref(); peer.once('exit', exited)
  try { if (peer.connected) peer.send({ type: 'close' }, () => {}) } catch {}
}

/** One helper holds only its own ICE state; each connection still owns its process. */
export function createRemotePeerPool(forkPeer: () => ChildProcess) {
  let standby: ChildProcess | undefined, retry: ReturnType<typeof setTimeout> | undefined, wanted = false, closed = false
  const spawn = () => {
    const peer = forkPeer()
    const ping = setInterval(() => { if (peer.connected) peer.send({ type: 'ping' }, () => {}) }, 2000)
    ping.unref(); peer.once('exit', () => clearInterval(ping))
    return peer
  }
  function later() {
    if (!wanted || closed || retry) return
    retry = setTimeout(() => { retry = undefined; warm() }, 5000)
    retry.unref()
  }
  function warm() {
    if (closed) return
    wanted = true
    if (standby || retry) return
    try {
      const peer = spawn()
      standby = peer
      const rotation = setTimeout(() => {
        if (standby !== peer) return
        standby = undefined; closeRemotePeer(peer); warm()
      }, 30_000)
      rotation.unref(); peer.once('exit', () => clearTimeout(rotation))
      const failed = () => {
        if (standby !== peer) return
        standby = undefined; closeRemotePeer(peer); later()
      }
      peer.once('error', failed)
      peer.once('exit', failed)
    } catch { later() }
  }
  return {
    warm,
    take() {
      wanted = false; clearTimeout(retry); retry = undefined
      const peer = standby
      standby = undefined
      if (peer?.connected) return peer
      if (peer) closeRemotePeer(peer)
      return spawn()
    },
    clear() {
      wanted = false; clearTimeout(retry); retry = undefined
      const peer = standby
      standby = undefined
      if (peer) closeRemotePeer(peer)
    },
    close() { closed = true; this.clear() },
  }
}
