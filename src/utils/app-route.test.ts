import assert from 'node:assert/strict'
import test from 'node:test'
import { appRoute, parsePublicSharePath } from '../../shared/app-route.ts'

test('application routes distinguish workspace, public shares and missing pages', () => {
  for (const path of ['/', '/index.html']) assert.equal(appRoute(path), 'workspace')
  for (const type of ['f', 'd']) for (const suffix of ['', '/']) {
    const path = `/share/${type}/${'a'.repeat(43)}${suffix}`
    assert.equal(appRoute(path), 'share')
    assert.deepEqual(parsePublicSharePath(path), { type, id: 'a'.repeat(43) })
  }
  for (const path of ['/404', '/missing', '/share', '/share/f/short', `/share/x/${'a'.repeat(43)}`, `/share/f/${'a'.repeat(44)}`, '/assets/missing.js']) {
    assert.equal(appRoute(path), 'not-found', path)
  }
  assert.equal(appRoute('/demo/', '/demo/'), 'workspace')
  assert.equal(appRoute('/demo/missing', '/demo/'), 'not-found')
})
