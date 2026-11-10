import test from 'node:test'
import assert from 'node:assert/strict'
import { remotePath } from '../shared/remote-access.ts'
import { desktopAutoNat, desktopIceServers } from './rtc-config.ts'

test('Mewlink rejects the removed desktop socket while retaining browser access', () => {
  assert.equal(remotePath('/api/remote-desktop/ws', true), false)
  assert.equal(remotePath('/api/browser-desktop/ws', true), true)
  assert.equal(remotePath('/api/dom-browser/ws', true), true)
})

test('browser RTC settings remain available after desktop removal', () => {
  assert.equal(desktopAutoNat({}), true)
  assert.equal(desktopAutoNat({ MEW_DESKTOP_AUTO_NAT: '0' }), false)
  assert.deepEqual(desktopIceServers({ MEW_DESKTOP_ICE_SERVERS: '[{"urls":"stun:example.test:3478"}]' }), [{ urls: ['stun:example.test:3478'] }])
  assert.throws(() => desktopIceServers({ MEW_DESKTOP_ICE_SERVERS: '[{"urls":"turn:example.test"}]' }))
})
