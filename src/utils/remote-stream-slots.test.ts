import test from 'node:test'
import assert from 'node:assert/strict'
import { RemoteStreamSlots } from './remote-stream-slots.ts'

test('separate pools unblock HTTP behind sixteen persistent sockets and preserve FIFO within each kind', async () => {
  const slots = new RemoteStreamSlots(), releases = await Promise.all(Array.from({ length: 16 }, () => slots.acquire(undefined, 'socket')))
  const order: string[] = []
  const sockets = ['socket-1', 'socket-2'].map(name => slots.acquire(undefined, 'socket').then(release => { order.push(name); return release }))
  const request = slots.acquire(undefined, 'request').then(release => { order.push('request'); return release })
  await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(order, [])
  slots.enableSeparate(); const releaseRequest = await request
  assert.deepEqual(order, ['request'])
  releases[0](); const first = await sockets[0]; assert.deepEqual(order, ['request', 'socket-1'])
  first(); const second = await sockets[1]; assert.deepEqual(order, ['request', 'socket-1', 'socket-2'])
  second(); releaseRequest(); for (const release of releases) release(); slots.close()
})
test('without a capability echo HTTP and WS keep the legacy shared sixteen limit', async () => {
  const slots = new RemoteStreamSlots(), releases = await Promise.all(Array.from({ length: 16 }, () => slots.acquire(undefined, 'socket')))
  const controller = new AbortController()
  let started = false
  const pending = slots.acquire(controller.signal, 'request').then(() => { started = true })
  await new Promise(resolve => setImmediate(resolve)); assert.equal(started, false)
  controller.abort(); await assert.rejects(pending, { name: 'AbortError' })
  for (const release of releases) release(); slots.close()
})
test('a full socket waiting queue cannot reject a request with independent pool capacity', async () => {
  const slots = new RemoteStreamSlots(); slots.enableSeparate()
  const releases = await Promise.all(Array.from({ length: 16 }, () => slots.acquire(undefined, 'socket')))
  const controller = new AbortController()
  const waiting = Array.from({ length: 64 }, () => slots.acquire(controller.signal, 'socket').catch(error => error.name))
  const releaseRequest = await slots.acquire(undefined, 'request'); releaseRequest()
  controller.abort(); assert.deepEqual(await Promise.all(waiting), Array(64).fill('AbortError'))
  for (const release of releases) release(); slots.close()
})

test('fourteen resource reads reserve two ordinary request slots in either arrival order', async () => {
  for (const apiFirst of [false, true]) {
    const slots = new RemoteStreamSlots(); slots.enableSeparate()
    const ordinary: (() => void)[] = []
    if (apiFirst) ordinary.push(await slots.acquire(), await slots.acquire())
    const resources = await Promise.all(Array.from({ length: 14 }, () => slots.acquire(undefined, 'request', true)))
    let resourceStarted = false, ordinaryStarted = false
    const nextResource = slots.acquire(undefined, 'request', true).then(release => { resourceStarted = true; return release })
    if (!apiFirst) ordinary.push(await slots.acquire(), await slots.acquire())
    const nextOrdinary = slots.acquire().then(release => { ordinaryStarted = true; return release })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(resourceStarted, false)
    assert.equal(ordinaryStarted, false, 'the total request limit remains sixteen')
    ordinary[0](); const finishOrdinary = await nextOrdinary
    assert.equal(resourceStarted, false, 'an ordinary release cannot consume the reserved capacity with resource work')
    resources[0](); const finishResource = await nextResource
    finishResource(); finishOrdinary(); for (const release of [...resources, ...ordinary]) release(); slots.close()
  }
})

test('legacy shared streams reserve capacity behind assets while retaining class FIFO and cancellation', async () => {
  const slots = new RemoteStreamSlots()
  const sockets = await Promise.all(Array.from({ length: 4 }, () => slots.acquire(undefined, 'socket')))
  const resources = await Promise.all(Array.from({ length: 10 }, () => slots.acquire(undefined, 'request', true)))
  const order: string[] = [], abort = new AbortController()
  const firstResource = slots.acquire(undefined, 'request', true).then(release => { order.push('resource-1'); return release })
  const cancelled = slots.acquire(abort.signal, 'request', true)
  const secondResource = slots.acquire(undefined, 'request', true).then(release => { order.push('resource-2'); return release })
  const firstApi = await slots.acquire(), secondApi = await slots.acquire()
  const thirdApi = slots.acquire().then(release => { order.push('api-1'); return release })
  const fourthApi = slots.acquire().then(release => { order.push('api-2'); return release })
  abort.abort(); await assert.rejects(cancelled, { name: 'AbortError' })
  firstApi(); const releaseThird = await thirdApi
  assert.deepEqual(order, ['api-1'], 'ordinary requests bypass blocked resources')
  releaseThird(); const releaseFourth = await fourthApi
  assert.deepEqual(order, ['api-1', 'api-2'], 'ordinary FIFO remains intact')
  resources[0](); const releaseFirst = await firstResource
  releaseFirst(); const releaseSecond = await secondResource
  assert.deepEqual(order, ['api-1', 'api-2', 'resource-1', 'resource-2'])
  releaseSecond(); releaseFourth(); secondApi(); for (const release of [...resources, ...sockets]) release(); slots.close()
})

test('a full resource queue cannot block reserved API capacity and close rejects remaining resource work', async () => {
  const slots = new RemoteStreamSlots(); slots.enableSeparate()
  const resources = await Promise.all(Array.from({ length: 14 }, () => slots.acquire(undefined, 'request', true)))
  const waiting = Array.from({ length: 64 }, () => slots.acquire(undefined, 'request', true).then(() => 'started', error => error.message))
  await assert.rejects(slots.acquire(undefined, 'request', true), /대기열이 가득/)
  const api = await slots.acquire()
  slots.close()
  assert.deepEqual(await Promise.all(waiting), Array(64).fill('원격 연결이 종료됐습니다.'))
  api(); api(); for (const release of resources) { release(); release() }
})
