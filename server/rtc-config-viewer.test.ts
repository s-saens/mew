import assert from 'node:assert/strict'
import { test } from 'node:test'
import { desktopIceServers, viewerIceServers } from './rtc-config.ts'

test('viewer ICE configuration retains host STUN addresses without credentials', () => {
  const servers = desktopIceServers({ MEW_DESKTOP_ICE_SERVERS: JSON.stringify([{ urls: ['stun:example.test:3478'], username: 'user', credential: 'secret' }]) })
  assert.deepEqual(viewerIceServers(servers), [{ urls: ['stun:example.test:3478'] }])
})

test('viewer never receives credentials embedded in a configured URL', () => {
  assert.deepEqual(viewerIceServers([{ urls: ['stun:user:secret@example.test', 'stun:example.test?token=secret', 'stun:valid.test:3478'] }]), [{ urls: ['stun:valid.test:3478'] }])
})
