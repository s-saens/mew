import test from 'node:test'
import assert from 'node:assert/strict'
import type express from 'express'
import { securityHeaders } from './security-headers.ts'

function headersFor(secure = false, forwardedProto?: string) {
  const headers = new Map<string, string>()
  let continued = false
  securityHeaders(
    { secure, headers: { 'x-forwarded-proto': forwardedProto } } as unknown as express.Request,
    { setHeader(name: string, value: string) { headers.set(name, value) } } as express.Response,
    () => { continued = true },
  )
  assert.equal(continued, true)
  return headers
}

test('workspace permits same-origin microphone recording while blocking other sensitive features', () => {
  const headers = headersFor()
  const policy = new Map(headers.get('Permissions-Policy')!.split(', ').map(directive => {
    const [feature, allowlist] = directive.split('=')
    return [feature, allowlist] as const
  }))
  assert.equal(policy.get('microphone'), '(self)')
  for (const feature of ['camera', 'geolocation', 'payment']) assert.equal(policy.get(feature), '()')
  assert.equal(headers.get('X-Frame-Options'), 'DENY')
  assert.match(headers.get('Content-Security-Policy')!, /frame-ancestors 'none'/)
  assert.match(headers.get('Content-Security-Policy')!, /media-src 'self' data: blob: https:/)
  assert.equal(headers.get('X-Content-Type-Options'), 'nosniff')
  assert.equal(headers.has('Strict-Transport-Security'), false)
})

test('TLS and forwarded HTTPS preserve transport protection', () => {
  for (const headers of [headersFor(true), headersFor(false, 'https')]) {
    assert.equal(headers.get('Strict-Transport-Security'), 'max-age=31536000; includeSubDomains')
    assert.match(headers.get('Permissions-Policy')!, /microphone=\(self\)/)
  }
})
