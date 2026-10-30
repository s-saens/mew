import test from 'node:test'
import assert from 'node:assert/strict'
import { remoteLauncherRole } from '../shared/remote-launcher-role.ts'

test('public-share device URLs open the connection role only for complete capability paths', () => {
  const token = 'a'.repeat(43)
  for (const type of ['f', 'd']) assert.equal(remoteLauncherRole(`/owner/device/share/${type}/${token}`), 'connect')
  for (const suffix of [`share/f/${'a'.repeat(42)}`, `share/f/${token}/extra`, `share/x/${token}`, 'share/f', 'share']) assert.equal(remoteLauncherRole(`/owner/device/${suffix}`), 'dashboard', suffix)
})

test('launcher roles keep public device and port URLs separate from registration and app frames', () => {
  for (const pathname of ['/user/home', '/user/home/1', '/user/home/65535/nested/path', '/user/home/5000/']) {
    assert.equal(remoteLauncherRole(pathname), 'connect', pathname)
  }
  for (const pathname of ['/', '/user', '/dashboard', '/account', '/register/registration-code', '/user/home/0', '/user/home/65536', '/user/home/port']) {
    assert.equal(remoteLauncherRole(pathname), 'dashboard', pathname)
  }
  assert.equal(remoteLauncherRole('/launch/frame-id'), 'app')
})
