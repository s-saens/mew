import { objectBounds } from './geometry.ts'
import { expandSelection, type Bounds, type DrawingGrid, type DrawingObject, type Point, type SelectionIds } from './model.ts'

interface SnapTarget { value: number; from: number; to: number }
export interface SnapTargets { x: readonly SnapTarget[]; y: readonly SnapTarget[] }
export interface SnapGuide extends SnapTarget { axis: 'x' | 'y' }
export interface PointSnapResult { point: Point; guides: SnapGuide[] }
export interface BoundsSnapResult { bounds: Bounds; delta: Point; guides: SnapGuide[] }

/** Build once at gesture start. Bounds and sorted anchors remain stable while objects move. */
export function buildSnapTargets(objects: readonly DrawingObject[], excludedIds: SelectionIds = []): SnapTargets {
  const excluded = new Set(expandSelection(objects, excludedIds))
  const x: SnapTarget[] = [], y: SnapTarget[] = []
  for (const object of objects) {
    if (excluded.has(object.id)) continue
    const bounds = objectBounds(object)
    for (const fraction of [0, .5, 1]) {
      x.push({ value: bounds.x + bounds.width * fraction, from: bounds.y, to: bounds.y + bounds.height })
      y.push({ value: bounds.y + bounds.height * fraction, from: bounds.x, to: bounds.x + bounds.width })
    }
  }
  const sort = (a: SnapTarget, b: SnapTarget) => a.value - b.value
  return { x: x.sort(sort), y: y.sort(sort) }
}

function tolerance(grid: DrawingGrid, zoom: number): number {
  const distance = typeof grid.snapTolerance === 'number' && Number.isFinite(grid.snapTolerance) ? Math.max(1, Math.min(24, grid.snapTolerance)) : 6
  return distance / (Number.isFinite(zoom) && zoom > 0 ? zoom : 1)
}

function nearest(value: number, targets: readonly SnapTarget[], threshold: number): SnapTarget | undefined {
  let low = 0, high = targets.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (targets[middle].value < value) low = middle + 1
    else high = middle
  }
  const right = targets[low], left = targets[low - 1]
  const result = !left || (right && Math.abs(right.value - value) < Math.abs(left.value - value)) ? right : left
  return result && Math.abs(result.value - value) <= threshold ? result : undefined
}

const gridValue = (value: number, grid: DrawingGrid) => grid.snap && Number.isFinite(grid.size) && grid.size > 0 ? Math.round(value / grid.size) * grid.size : value

export function snapDrawingPoint(point: Point, grid: DrawingGrid, zoom = 1, targets?: SnapTargets): PointSnapResult {
  const result = { x: gridValue(point.x, grid), y: gridValue(point.y, grid) }
  const guides: SnapGuide[] = []
  if (grid.objectSnap && targets) {
    const threshold = tolerance(grid, zoom)
    for (const axis of ['x', 'y'] as const) {
      const target = nearest(point[axis], targets[axis], threshold)
      if (!target) continue
      result[axis] = target.value
      const cross = point[axis === 'x' ? 'y' : 'x']
      guides.push({ axis, value: target.value, from: Math.min(cross, target.from), to: Math.max(cross, target.to) })
    }
  }
  return { point: result, guides }
}

export function snapDrawingBounds(bounds: Bounds, grid: DrawingGrid, zoom = 1, targets?: SnapTargets): BoundsSnapResult {
  const delta = { x: gridValue(bounds.x, grid) - bounds.x, y: gridValue(bounds.y, grid) - bounds.y }
  const guides: SnapGuide[] = []
  if (grid.objectSnap && targets) {
    const threshold = tolerance(grid, zoom)
    for (const axis of ['x', 'y'] as const) {
      const extent = axis === 'x' ? bounds.width : bounds.height
      let chosen: { target: SnapTarget; offset: number } | undefined
      for (const fraction of [0, .5, 1]) {
        const value = bounds[axis] + extent * fraction
        const target = nearest(value, targets[axis], threshold)
        if (!target) continue
        const offset = target.value - value
        if (!chosen || Math.abs(offset) < Math.abs(chosen.offset)) chosen = { target, offset }
      }
      if (!chosen) continue
      delta[axis] = chosen.offset
      const crossAxis = axis === 'x' ? 'y' : 'x', crossSize = axis === 'x' ? bounds.height : bounds.width
      guides.push({ axis, value: chosen.target.value, from: Math.min(bounds[crossAxis], chosen.target.from), to: Math.max(bounds[crossAxis] + crossSize, chosen.target.to) })
    }
  }
  return { bounds: { ...bounds, x: bounds.x + delta.x, y: bounds.y + delta.y }, delta, guides }
}
