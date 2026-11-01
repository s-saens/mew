import assert from 'node:assert/strict'
import test from 'node:test'
import { objectLocalToWorld, pathData } from './geometry.ts'
import { finalizeFreehand, FreehandSampler, MAX_FREEHAND_POINTS } from './freehand.ts'
import { createDocument, normalizeDocument, type Point } from './model.ts'
import { parseSvgDocument, serializeSvg } from './svg.ts'

const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} should be near ${expected}`)

test('sampling uses screen spacing and always retains the first and latest positions', () => {
  const input = Array.from({ length: 101 }, (_, index) => ({ x: index / 10, y: 0 }))
  const normal = new FreehandSampler(), zoomedOut = new FreehandSampler(.5), zoomedIn = new FreehandSampler(2)
  for (const sampler of [normal, zoomedOut, zoomedIn]) {
    assert.equal(sampler.append(input), true)
    assert.deepEqual(sampler.points[0], input[0])
    assert.deepEqual(sampler.points.at(-1), input.at(-1))
    assert.equal(sampler.append(input.at(-1)!), false)
  }
  assert.ok(zoomedOut.points.length < normal.points.length)
  assert.ok(zoomedIn.points.length > normal.points.length)
  assert.ok(normal.points.length < input.length / 5)
})

test('long strokes decimate to the import limit while retaining endpoints and ignoring invalid samples', () => {
  const sampler = new FreehandSampler()
  const first = { x: -40_000, y: -20 }, last = { x: 40_000, y: 20 }
  sampler.append(first)
  for (let index = -19_999; index <= 20_000; index++) {
    sampler.append({ x: index * 2, y: index / 1000 })
    assert.ok(sampler.points.length <= MAX_FREEHAND_POINTS)
  }
  assert.deepEqual(sampler.points[0], first)
  assert.deepEqual(sampler.points.at(-1), last)
  const count = sampler.points.length
  assert.equal(sampler.append([{ x: NaN, y: 0 }, { x: 0, y: Infinity }]), false)
  assert.equal(sampler.points.length, count)
  const document = { ...createDocument(), objects: [finalizeFreehand(sampler.points)] }
  assert.ok(normalizeDocument(document))
  assert.deepEqual(parseSvgDocument(serializeSvg(document)), normalizeDocument(document))
})

test('finalization smooths ordinary paths and preserves endpoint world coordinates and input', () => {
  const input = [{ x: -10, y: 20 }, { x: 0, y: 25 }, { x: 10, y: 35 }, { x: 20, y: 40 }]
  const before = structuredClone(input)
  const object = finalizeFreehand(input, { id: 'ink', stroke: '#ef4444', strokeWidth: 4, fill: '#fff' })
  assert.equal(object.id, 'ink'); assert.equal(object.type, 'path'); assert.equal(object.closed, false)
  assert.equal(object.stroke, '#ef4444'); assert.equal(object.strokeWidth, 4); assert.equal(object.fill, 'none')
  assert.ok(pathData(object.points!).includes(' C '))
  assert.deepEqual(input, before)
  const first = objectLocalToWorld(object, object.points![0]), last = objectLocalToWorld(object, object.points!.at(-1)!)
  near(first.x, input[0].x); near(first.y, input[0].y)
  near(last.x, input.at(-1)!.x); near(last.y, input.at(-1)!.y)
  const middle = object.points![1]
  const left = { x: middle.x - middle.in!.x, y: middle.y - middle.in!.y }
  const right = { x: middle.out!.x - middle.x, y: middle.out!.y - middle.y }
  near(left.x, right.x); near(left.y, right.y)
})

test('sharp turns keep every cubic control inside its segment bounds', () => {
  const object = finalizeFreehand([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 1 }, { x: -100, y: -20 }, { x: -101, y: 100 }])
  const between = (value: number, a: number, b: number) => assert.ok(value >= Math.min(a, b) - 1e-7 && value <= Math.max(a, b) + 1e-7)
  for (let index = 1; index < object.points!.length; index++) {
    const a = object.points![index - 1], b = object.points![index]
    for (const control of [a.out!, b.in!]) { between(control.x, a.x, b.x); between(control.y, a.y, b.y) }
  }
})

test('tap and duplicate samples produce a tiny renderable dot path', () => {
  const tap = { x: -200, y: 100 }
  for (const input of [[tap], [tap, tap]]) {
    const object = finalizeFreehand(input)
    assert.equal(object.points!.length, 2)
    const first = objectLocalToWorld(object, object.points![0]), last = objectLocalToWorld(object, object.points![1])
    near(first.x, tap.x); near(first.y, tap.y)
    assert.ok(last.x > first.x && last.x - first.x <= .0011)
    near(first.y, last.y)
    assert.ok(pathData(object.points!).includes('0.001'))
  }
})

test('finalization bounds arbitrary oversized input and retains both endpoints', () => {
  const input: Point[] = Array.from({ length: MAX_FREEHAND_POINTS * 3 }, (_, index) => ({ x: index, y: index % 2 }))
  const object = finalizeFreehand(input)
  assert.ok(object.points!.length <= MAX_FREEHAND_POINTS)
  near(objectLocalToWorld(object, object.points![0]).x, input[0].x)
  near(objectLocalToWorld(object, object.points!.at(-1)!).x, input.at(-1)!.x)
})
