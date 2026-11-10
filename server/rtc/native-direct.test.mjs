import test from 'node:test'
import assert from 'node:assert/strict'
import { nativeDirect } from './native-direct.mjs'

test('browser transport forwards input and omits removed desktop control features', async () => {
  const channels = new Map(), emitted = [], inputs = [], errors = []
  class PeerConnection {
    addTrack() { return { setMediaHandler() {}, onOpen() {}, onError() {}, onMessage() {}, isOpen: () => true } }
    createDataChannel(label) {
      const channel = { onOpen(fn) { this.open = fn }, onMessage(fn) { this.message = fn }, onClosed() {}, onError() {}, close() {}, isOpen: () => true, sendMessage() {} }
      channels.set(label, channel); return channel
    }
    onLocalDescription() {} onLocalCandidate() {} onGatheringStateChange() {} onStateChange() {} setLocalDescription() {} close() {}
  }
  class Video { addH264Codec() {} addSSRC() {} setBitrate() {} }
  class Reporter { addToChain() {} }
  const rtc = { PeerConnection, Video, RtpPacketizationConfig: class {}, RtcpSrReporter: Reporter, RtcpNackResponder: class {} }
  const transport = nativeDirect(rtc, {
    iceServers: [], autoNat: false, emit: value => emitted.push(value), input: (value, reliable) => inputs.push([value, reliable]),
    keyframe() {}, bitrate() {}, fail: error => errors.push(error),
    connectivity: () => ({ connected() {}, candidate() {}, close() {} }),
  })
  channels.get('motion').open(); channels.get('control').open()
  assert.deepEqual(emitted.find(value => value.type === 'connected'), { type: 'connected', native: true })
  channels.get('motion').message(JSON.stringify({ type: 'pointer', x: 3, y: 4 }))
  channels.get('control').message(JSON.stringify({ type: 'key', key: 'a' }))
  assert.deepEqual(inputs, [[{ type: 'pointer', x: 3, y: 4 }, false], [{ type: 'key', key: 'a' }, true]])
  assert.deepEqual(errors, [])
  await transport.close()
})
