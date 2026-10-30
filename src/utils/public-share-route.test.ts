import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePublicSharePath, publicShareRelativePath } from './public-share-route.ts'

test('public entry routes accept only exact typed capability paths', () => {
  const id = 'a'.repeat(43)
  assert.deepEqual(parsePublicSharePath(`/share/f/${id}`), { type: 'f', id })
  assert.deepEqual(parsePublicSharePath(`/share/d/${id}/`), { type: 'd', id })
  for (const value of [`/share/x/${id}`, `/share/f/${id}/other`, '/share/f/short', `/share/f/${id}?admin=1`, `/share/f/${id.slice(1)}`]) assert.equal(parsePublicSharePath(value), null)
})

test('public document links stay inside the published folder without workspace aliases', () => {
  assert.equal(publicShareRelativePath('guides/start.md', '../README.md#start'), 'README.md')
  assert.equal(publicShareRelativePath('guides/start.md', '/images/a.png'), 'images/a.png')
  assert.equal(publicShareRelativePath('README.md', 'space%20name.md'), 'space name.md')
  for (const value of ['../private.md', '%2e%2e/private.md', '../../private.md', 'docs:secret.md', '//host/private.md', 'https://example.test', '#heading', 'folder%5csecret.md', 'file%00.md']) assert.equal(publicShareRelativePath('README.md', value), null)
})
