import { normalizePathObject } from './geometry.ts'
import { createObject, type DrawingObject, type DrawingPoint, type Point } from './model.ts'

export const MAX_FREEHAND_POINTS = 10_000
const MIN_SAMPLE_SCREEN_DISTANCE = 1.5
const distanceSquared = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2
const finitePoint = (point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y)

/** Keeps a sampled stroke and its latest endpoint without growing with every pointer event. */
export class FreehandSampler {
  private samples: Point[] = []
  private pending = false
  private spacing: number

  constructor(zoom = 1) {
    this.spacing = MIN_SAMPLE_SCREEN_DISTANCE / (Number.isFinite(zoom) && zoom > 0 ? zoom : 1)
  }

  get points(): readonly Point[] { return this.samples }

  append(input: Point | readonly Point[]): boolean {
    const points = Array.isArray(input) ? input : [input as Point]
    let changed = false
    for (const point of points) {
      if (!finitePoint(point)) continue
      const last = this.samples.at(-1)
      if (last && point.x === last.x && point.y === last.y) continue
      changed = true
      if (!last) { this.samples.push({ x: point.x, y: point.y }); continue }
      const anchor = this.samples[this.samples.length - (this.pending ? 2 : 1)]
      const sampled = distanceSquared(point, anchor) >= this.spacing ** 2
      if (this.pending) {
        this.samples[this.samples.length - 1] = { x: point.x, y: point.y }
        this.pending = !sampled
        continue
      }
      if (this.samples.length >= MAX_FREEHAND_POINTS) {
        let write = 1
        for (let read = 2; read < this.samples.length - 1; read += 2) this.samples[write++] = this.samples[read]
        this.samples[write++] = last
        this.samples.length = write
        this.spacing *= 2
      }
      this.samples.push({ x: point.x, y: point.y })
      this.pending = !sampled
    }
    return changed
  }
}

function boundedSamples(input: readonly Point[]): Point[] {
  const points = input.filter(finitePoint)
  const stride = Math.max(1, (points.length - 1) / (MAX_FREEHAND_POINTS - 1))
  const output: Point[] = []
  const count = Math.min(MAX_FREEHAND_POINTS, points.length)
  for (let index = 0; index < count; index++) {
    const point = points[Math.round(index * stride)]
    const previous = output.at(-1)
    if (!previous || previous.x !== point.x || previous.y !== point.y) output.push({ x: point.x, y: point.y })
  }
  return output
}

/** Produces cubic controls inside each segment's box so corners cannot develop loops. */
function smoothPoints(points: readonly Point[]): DrawingPoint[] {
  const result: DrawingPoint[] = points.map(point => ({ ...point }))
  const tangent = (index: number) => {
    const before = points[Math.max(0, index - 1)], after = points[Math.min(points.length - 1, index + 1)]
    return { x: (after.x - before.x) / 6, y: (after.y - before.y) / 6 }
  }
  for (let index = 0; index < result.length - 1; index++) {
    const a = result[index], b = result[index + 1], ta = tangent(index), tb = tangent(index + 1)
    const clamp = (value: number, left: number, right: number) => Math.max(Math.min(left, right), Math.min(Math.max(left, right), value))
    a.out = { x: clamp(a.x + ta.x, a.x, b.x), y: clamp(a.y + ta.y, a.y, b.y) }
    b.in = { x: clamp(b.x - tb.x, a.x, b.x), y: clamp(b.y - tb.y, a.y, b.y) }
  }
  return result
}

/** Freehand is saved as an ordinary open path; round stroke caps render a tap as a dot. */
export function finalizeFreehand(input: readonly Point[], overrides: Partial<DrawingObject> = {}): DrawingObject {
  const points = boundedSamples(input)
  if (!points.length) points.push({ x: 0, y: 0 })
  if (points.length === 1) points.push({ x: points[0].x + .001, y: points[0].y })
  return normalizePathObject(createObject('path', {
    ...overrides, type: 'path', x: 0, y: 0, width: 0, height: 0, rotation: 0,
    points: smoothPoints(points), fill: 'none', closed: false,
  }))
}
