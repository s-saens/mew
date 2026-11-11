import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveRemoteAddress } from './remote-access-address.ts'

test('public device addresses use the canonical username without central credentials for current and legacy registrations', async t => {
  for (const origin of ['https://link.mew.run', 'https://mew.run', 'https://mew.saens.kr', 'https://central.example.test']) {
    await t.test(origin, async t => {
      const publicOrigin = origin === 'https://central.example.test' ? origin : 'https://link.mew.run'
      t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
        assert.equal(String(input), `${publicOrigin}/internal-account-id/laptop`)
        assert.equal(init?.method, 'HEAD')
        assert.equal(init?.redirect, 'manual')
        assert.equal(init?.headers, undefined)
        return new Response(null, { status: 307, headers: { location: `${publicOrigin}/alice/laptop` } })
      })
      assert.deepEqual(await resolveRemoteAddress(origin, 'internal-account-id', 'laptop'), {
        username: 'alice', url: `${publicOrigin}/alice/laptop`, dashboardUrl: `${publicOrigin}/alice`,
      })
    })
  }
})

test('unverified, foreign, and mismatched addresses never become device links', async t => {
  for (const location of [null, 'https://evil.example/alice/laptop', 'https://mew.run/alice/laptop', 'https://mew.saens.kr/alice/laptop', 'https://link.mew.run/alice/another-device', 'https://link.mew.run/internal-account-id/laptop', 'https://link.mew.run/alice/laptop?token=secret', 'https://link.mew.run/alice/laptop#fragment', 'https://user:password@link.mew.run/alice/laptop', 'https://link.mew.run/alice']) {
    await t.test(String(location), async t => {
      t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: location ? 307 : 200, headers: location ? { location } : {} }))
      await assert.rejects(resolveRemoteAddress('https://link.mew.run', 'internal-account-id', 'laptop'))
    })
  }
})
