import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { waitForTermuxHttp } from './termux-ready.mjs'

test('Termux waits for Mew HTTP readiness rather than treating a live PID as ready', async t => {
  let requests = 0
  const server = createServer((req, res) => {
    assert.equal(req.url, '/api/auth/me')
    requests++
    if (requests === 1) return res.writeHead(503).end()
    if (requests === 2) return res.end('<html>not Mew</html>')
    res.end(JSON.stringify({ authenticated: false, setupRequired: true }))
  }).listen(0, '127.0.0.1')
  t.after(() => server.close())
  await once(server, 'listening')
  await waitForTermuxHttp('http://127.0.0.1:' + server.address().port, process.pid, 2500)
  assert.equal(requests, 3)
})

test('Termux rejects an unreachable listener and an invalid PID', async t => {
  const server = createServer((_req, res) => res.writeHead(404).end()).listen(0, '127.0.0.1')
  t.after(() => server.close())
  await once(server, 'listening')
  const url = 'http://127.0.0.1:' + server.address().port
  await assert.rejects(waitForTermuxHttp(url, process.pid, 300), /did not become ready/)
  await assert.rejects(waitForTermuxHttp(url, -1), /Invalid Mew process ID/)
})
