import assert from 'node:assert/strict'
import { test } from 'node:test'
import { browserDesktopIceServers } from './browser-desktop-peer.ts'

test('browser viewer accepts bounded STUN servers and never accepts TURN or credentials', () => {
  assert.deepEqual(browserDesktopIceServers([{ urls: ['stun:one.example:3478', 'stuns:two.example:5349'], credential: 'private' }]), [{ urls: ['stun:one.example:3478', 'stuns:two.example:5349'] }])
  assert.deepEqual(browserDesktopIceServers([{ urls: 'turn:example.test' }]), [])
  assert.deepEqual(browserDesktopIceServers([{ urls: ['stun:ok', 'stun:bad\naddress'] }]), [])
  assert.deepEqual(browserDesktopIceServers(undefined), [])
  assert.deepEqual(browserDesktopIceServers(Array.from({ length: 9 }, () => ({ urls: 'stun:a' }))), [])
})

test('offer configures the viewer with the host STUN addresses', async () => {
  const { browserDesktopPeer } = await import('./browser-desktop-peer.ts')
  const original = globalThis.RTCPeerConnection
  let config: RTCConfiguration | undefined
  class FakePeer {
    connectionState = 'new'
    remoteDescription: unknown = null
    localDescription = { type: 'answer', sdp: 'answer' }
    constructor(value: RTCConfiguration) { config = value }
    getReceivers() { return [] }
    close() {}
    async setRemoteDescription(value: unknown) { this.remoteDescription = value }
    async createAnswer() { return this.localDescription }
    async setLocalDescription() {}
  }
  globalThis.RTCPeerConnection = FakePeer as unknown as typeof RTCPeerConnection
  const peer = browserDesktopPeer({ signal: () => {}, stream: () => {}, failed: () => assert.fail('unexpected failure') })
  try {
    await peer.message({ type: 'offer', negotiation: 0, sdp: 'offer', iceServers: [{ urls: ['stun:host.example:3478'], credential: 'not-forwarded' }] })
    assert.deepEqual(config, { iceServers: [{ urls: ['stun:host.example:3478'] }], bundlePolicy: 'max-bundle' })
  } finally { peer.close(); globalThis.RTCPeerConnection = original }
})
