import assert from 'node:assert/strict'
import test from 'node:test'
import { createDocument, createObject, type DrawingGrid } from './model.ts'
import { buildSnapTargets, snapDrawingBounds, snapDrawingPoint } from './snapping.ts'

const objectGrid: DrawingGrid = { size: 20, visible: true, snap: false, objectSnap: true }
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} should be near ${expected}`)

test('grid nearest rounding works at negative coordinates and independently of visibility and object snapping', () => {
  const grid = { ...createDocument().grid, visible: false }
  assert.deepEqual(snapDrawingPoint({ x: -31, y: 39 }, grid), { point: { x: -40, y: 40 }, guides: [] })
  const targets = buildSnapTargets([createObject('rect', { x: -33, y: 37, width: 40, height: 40 })])
  assert.deepEqual(snapDrawingPoint({ x: -31, y: 39 }, grid, 1, targets).point, { x: -40, y: 40 })
  const off = { ...grid, snap: false }
  assert.deepEqual(snapDrawingPoint({ x: -31, y: 39 }, off, 1, targets).point, { x: -31, y: 39 })
})

test('object point snapping chooses nearest edge or center on each axis and supplies guides', () => {
  const targets = buildSnapTargets([createObject('rect', { x: -40, y: -60, width: 100, height: 80 })])
  const result = snapDrawingPoint({ x: 13, y: -58 }, objectGrid, 1, targets)
  assert.deepEqual(result.point, { x: 10, y: -60 })
  assert.deepEqual(result.guides, [{ axis: 'x', value: 10, from: -60, to: 20 }, { axis: 'y', value: -60, from: -40, to: 60 }])
  assert.deepEqual(snapDrawingPoint({ x: 58, y: 18 }, objectGrid, 1, targets).point, { x: 60, y: 20 })
})

test('object tolerance stays in screen pixels as zoom changes and respects configured bounds', () => {
  const targets = buildSnapTargets([createObject('rect', { x: 0, y: 0, width: 100, height: 100 })])
  const point = { x: 4, y: 4 }
  assert.deepEqual(snapDrawingPoint(point, objectGrid, 1, targets).point, { x: 0, y: 0 })
  assert.deepEqual(snapDrawingPoint(point, objectGrid, 2, targets).point, point)
  assert.deepEqual(snapDrawingPoint({ x: -10, y: -10 }, objectGrid, .5, targets).point, { x: 0, y: 0 })
  assert.deepEqual(snapDrawingPoint(point, { ...objectGrid, snapTolerance: 2 }, 1, targets).point, point)
  assert.deepEqual(snapDrawingPoint(point, { ...objectGrid, snapTolerance: 8 }, 2, targets).point, { x: 0, y: 0 })
})

test('near object anchors take precedence over the grid while distant axes retain grid rounding', () => {
  const targets = buildSnapTargets([createObject('rect', { x: 13, y: 7, width: 40, height: 40 })])
  const result = snapDrawingPoint({ x: 14, y: 38 }, { ...objectGrid, snap: true }, 1, targets)
  assert.deepEqual(result.point, { x: 13, y: 40 })
  assert.equal(result.guides.length, 1)
})

test('moving bounds snap the nearest of left, center, or right anchors without resizing', () => {
  const targets = buildSnapTargets([createObject('rect', { x: 100, y: 80, width: 100, height: 40 })])
  const input = { x: 72, y: 11, width: 25, height: 65 }
  const result = snapDrawingBounds(input, objectGrid, 1, targets)
  assert.deepEqual(result.delta, { x: 3, y: 4 })
  assert.deepEqual(result.bounds, { ...input, x: 75, y: 15 })
  assert.deepEqual(result.guides, [{ axis: 'x', value: 100, from: 11, to: 120 }, { axis: 'y', value: 80, from: 72, to: 200 }])
  const centered = snapDrawingBounds({ x: 138, y: 140, width: 20, height: 20 }, objectGrid, 1, targets)
  near(centered.bounds.x + centered.bounds.width / 2, 150)
})

test('targets exclude selected groups, retain rotated bounds and stay static after their source changes', () => {
  const objects = [
    createObject('rect', { id: 'a', groupId: 'g', x: 1000 }),
    createObject('rect', { id: 'b', groupId: 'g', x: 2000 }),
    createObject('rect', { id: 'c', x: -100, y: -20, width: 100, height: 20, rotation: 90 }),
  ]
  const targets = buildSnapTargets(objects, ['a'])
  assert.equal(targets.x.length, 3); assert.equal(targets.y.length, 3)
  near(targets.x[0].value, -60); near(targets.x[2].value, -40)
  const before = structuredClone(targets)
  objects[2].x += 100
  assert.deepEqual(targets, before)
  assert.deepEqual(buildSnapTargets(objects, new Set(['a', 'c'])), { x: [], y: [] })
})
