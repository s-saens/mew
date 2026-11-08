import test from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error Native sender policies run as JavaScript in the helper.
import { videoAdaptation } from '../native/remote-desktop/video-adaptation.mjs'

const idle = { loss: 0, delay: 0, decoded: true, received: 0, decodedFrames: 0 }
const progress = { ...idle, received: 12, decodedFrames: 12, delay: 10 }
const stalled = { ...idle, received: 1 }

function fixture() {
  let time = 0, accepted = true
  const requests: number[] = []
  const adaptation = videoAdaptation({ maximum: 6_000_000, now: () => time, change() {},
    keyframe() { if (!accepted) return false; requests.push(time); return true } })
  return { requests, adaptation, accept(value: boolean) { accepted = value },
    sample(at: number, value = idle) { time = at; return adaptation.feedback(value) } }
}

test('initial decode recovery waits for the first IDR and limits retries to once per second', () => {
  const f = fixture(), waiting = { ...idle, decoded: false }
  for (const at of [0, 200, 400]) f.sample(at, waiting)
  assert.deepEqual(f.requests, [], 'incomplete or not-yet-received startup video is allowed to arrive')
  for (const at of [600, 800, 1000, 1200, 1400, 1600, 1800]) f.sample(at, waiting)
  assert.deepEqual(f.requests, [600, 1600])
  f.sample(2000, { ...waiting, received: 1, decodedFrames: 1, decoded: true })
  f.sample(3200)
  assert.deepEqual(f.requests, [600, 1600], 'successful decode ends startup recovery')
})

test('one undecodable frame retries across idle feedback without requesting an IDR every sample', () => {
  const f = fixture()
  f.sample(0, progress)
  f.sample(200, stalled)
  assert.deepEqual(f.requests, [200], 'the first completed undecodable frame requests prompt recovery')
  for (const at of [400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200]) f.sample(at)
  assert.deepEqual(f.requests, [200, 1200, 2200], 'an unresolved frame is retained even if no more frames arrive')
  f.sample(2400, { ...idle, decodedFrames: 1 })
  f.sample(3600)
  assert.deepEqual(f.requests, [200, 1200, 2200], 'decoding an earlier frame clears the stall during an idle receive interval')
})

test('healthy static screens never refresh and decode progress starts a new recovery episode', () => {
  const f = fixture()
  f.sample(0, progress)
  for (const at of [200, 400, 1600, 3000]) f.sample(at)
  assert.deepEqual(f.requests, [])
  f.sample(3200, stalled)
  f.sample(3400, progress)
  f.sample(3600, stalled)
  f.sample(3800, stalled)
  assert.deepEqual(f.requests, [3200, 3600], 'confirmed decode progress permits prompt recovery for a new stall')
})

test('a completed startup frame can recover promptly and first decode confirmation ends recovery', () => {
  const f = fixture()
  f.sample(0, { ...stalled, decoded: false })
  assert.deepEqual(f.requests, [0])
  f.sample(200, { ...idle, decoded: true })
  f.sample(1400)
  assert.deepEqual(f.requests, [0], 'the first cumulative decode confirmation proves startup progress')
})

test('receivers without interval frame counters stop retries after decode confirmation', () => {
  let time = 0, keys = 0
  const adaptation = videoAdaptation({ now: () => time, change() {}, keyframe() { keys++ } })
  adaptation.feedback({ loss: 0, delay: 0, decoded: false })
  time = 600; adaptation.feedback({ loss: 0, delay: 0, decoded: false })
  assert.equal(keys, 1)
  time = 800; adaptation.feedback({ loss: 0, delay: 0, decoded: true })
  time = 1800; adaptation.feedback({ loss: 0, delay: 0, decoded: true })
  assert.equal(keys, 1)
})

test('mode reconfiguration clears pending stalls and previous recovery cooldowns', () => {
  const f = fixture()
  f.sample(0, stalled)
  f.adaptation.configure(3_000_000)
  f.sample(200)
  f.sample(1400)
  assert.deepEqual(f.requests, [0], 'the old frame cannot request recovery in a new mode')
  f.sample(1600, stalled)
  f.adaptation.configure(6_000_000)
  f.sample(1800, stalled)
  assert.deepEqual(f.requests, [0, 1600, 1800], 'a new mode does not inherit the old cooldown')
})

test('an in-flight IDR suppression does not consume the recovery retry interval', () => {
  const f = fixture()
  f.accept(false)
  f.sample(0, stalled)
  f.sample(200)
  assert.deepEqual(f.requests, [])
  f.accept(true)
  f.sample(400)
  f.sample(600)
  f.sample(1400)
  assert.deepEqual(f.requests, [400, 1400])
})
