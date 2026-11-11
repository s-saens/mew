import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { randomFillSync } from 'node:crypto'
import vm from 'node:vm'

const root = new URL('./', import.meta.url)
const source = readFileSync(new URL('Mew/Resources/NativeBridge.js', root), 'utf8')

function host(reply = { ok: true, value: true }, kind = 'direct') {
  const requests = []
  const window = { webkit: { messageHandlers: { mewNative: { postMessage: async request => {
    requests.push(structuredClone(request))
    return typeof reply === 'function' ? reply(request) : reply
  } } } } }
  const context = vm.createContext({ window, crypto: { getRandomValues: bytes => randomFillSync(bytes) } })
  const script = source.replace('__MEW_CONNECTION_JSON__', JSON.stringify({ kind, scope: 'direct:https://example.com', endpoint: 'https://example.com' }))
    .replace('__MEW_DOCUMENT_TOKEN_JSON__', JSON.stringify('native-document-token'))
  vm.runInContext(script, context)
  return { bridge: window.mewNative, requests, window, context, script }
}

test('native bridge maps every operation and prevents arguments overriding protocol identity', async () => {
  const { bridge, requests } = host()
  const methods = [
    ['cache.get', bridge.cache.get], ['cache.put', bridge.cache.put], ['cache.remove', bridge.cache.remove],
    ['http.fetch', bridge.direct.fetch], ['http.cancel', bridge.direct.cancel], ['socket.open', bridge.direct.openSocket],
    ['socket.send', bridge.direct.sendSocket], ['socket.close', bridge.direct.closeSocket], ['http.reload', bridge.direct.reload],
    ['notifications.permission', bridge.notifications.permission], ['notifications.request', bridge.notifications.request],
    ['notifications.show', bridge.notifications.show], ['notifications.close', bridge.notifications.close],
  ]
  for (const [operation, invoke] of methods) {
    await invoke({ scope: 'instance', operation: 'arbitrary', version: 9, documentToken: 'attacker' })
    const request = requests.at(-1)
    assert.equal(request.operation, operation)
    assert.equal(request.version, 1)
    assert.equal(request.documentToken, 'native-document-token')
  }
})

test('native cache preserves miss and complete verified metadata values', async () => {
  const miss = host({ ok: true, value: null })
  assert.equal(await miss.bridge.cache.get({ scope: 'instance', path: '/assets/app.js' }), null)
  const value = { bodyBase64: 'YQ==', mimeType: 'text/javascript', sha256: 'digest', etag: '"rev"', storedAt: 1234 }
  const hit = host({ ok: true, value })
  assert.equal(await hit.bridge.cache.get({ scope: 'instance', path: '/assets/app.js' }), value)
  assert.deepEqual(hit.requests[0], { scope: 'instance', path: '/assets/app.js', version: 1, operation: 'cache.get', documentToken: 'native-document-token' })
})

test('failed native operations reject instead of appearing successful', async () => {
  const failure = host({ ok: false, error: 'Access denied' })
  await assert.rejects(failure.bridge.cache.get({}), /Access denied/)
  const malformed = host(null)
  await assert.rejects(malformed.bridge.direct.fetch({}), /Native operation failed/)
})

test('bridge cannot be replaced or mutated and repeated injection is harmless', () => {
  const { bridge, window, context, script } = host()
  for (const value of [bridge, bridge.connection, bridge.cache, bridge.direct, bridge.notifications]) assert.equal(Object.isFrozen(value), true)
  assert.throws(() => { window.mewNative = {} }, TypeError)
  assert.throws(() => { bridge.connection.endpoint = 'https://attacker' }, TypeError)
  vm.runInContext(script, context)
  assert.equal(window.mewNative, bridge)
})

test('custom-origin UUID fallback uses secure randomness with version and variant bits', () => {
  const { context } = host()
  const first = vm.runInContext('crypto.randomUUID()', context)
  const second = vm.runInContext('crypto.randomUUID()', context)
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.notEqual(first, second)
  const mewlink = host(undefined, 'mewlink')
  assert.equal(vm.runInContext('crypto.randomUUID', mewlink.context), undefined)
})

test('Xcode project references every native source and resource without dangling object references', () => {
  const project = readFileSync(new URL('Mew.xcodeproj/project.pbxproj', root), 'utf8')
  const declarations = [...project.matchAll(/^\s*([A-F0-9]{24}) = \{/gm)].map(match => match[1])
  assert.equal(new Set(declarations).size, declarations.length)
  const objectIDs = new Set(declarations)
  for (const [reference] of project.matchAll(/\b[A-F0-9]{24}\b/g)) assert.ok(objectIDs.has(reference), `Missing Xcode object ${reference}`)
  for (const name of ['NativeBridge.swift', 'NativeAssetCache.swift', 'NativeHTTPTransport.swift', 'NativeSchemeHandler.swift', 'WorkspaceWebView.swift', 'NativeHTTPTransportTests.swift']) {
    assert.ok(project.includes(`path = ${name};`), `Missing Xcode source ${name}`)
    const folder = name.endsWith('Tests.swift') ? 'MewTests' : 'Mew'
    assert.ok(existsSync(new URL(`${folder}/${name}`, root)))
  }
  for (const locale of ['en', 'ko', 'ja', 'zh-Hans']) {
    for (const file of ['Localizable', 'InfoPlist']) assert.ok(existsSync(new URL(`Mew/Resources/${locale}.lproj/${file}.strings`, root)))
  }
})

test('iOS app-bound origins and localized device guidance use the canonical Mewlink host', () => {
  const plist = readFileSync(new URL('Mew/Info.plist', root), 'utf8')
  const domains = plist.match(/<key>WKAppBoundDomains<\/key>\s*<array>([\s\S]*?)<\/array>/)?.[1]
  assert.ok(domains, 'app-bound domain declarations exist')
  assert.deepEqual([...domains.matchAll(/<string>([^<]+)<\/string>/g)].map(match => match[1]).sort(), ['app.mew.run', 'link.mew.run'])
  for (const locale of ['en', 'ko', 'ja', 'zh-Hans']) {
    const strings = readFileSync(new URL(`Mew/Resources/${locale}.lproj/Localizable.strings`, root), 'utf8')
    assert.ok(strings.includes('https://link.mew.run/username/device.'), `${locale} guidance uses the new origin`)
    assert.ok(!strings.includes('https://mew.run/username/device'), `${locale} guidance has no old origin`)
  }
})
