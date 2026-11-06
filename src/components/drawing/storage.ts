import { json } from '../../api/response'
import { mewFetch } from '../../utils/remote-transport'

export interface DrawingSummary {
  id: string
  name: string
  createdAt: string
  path: string
  bytes: number
}

export interface DrawingScope {
  drawings: DrawingSummary[]
  projectRoot: string
}

export interface SavedDrawing extends DrawingSummary {
  projectRoot: string
}

export interface StoredDrawing extends SavedDrawing {
  svg: string
}

export function createDrawingStorage(requestFetch: typeof mewFetch = mewFetch) {
  const scopedFetch = requestFetch

  function scopeQuery(projectRoot?: string): string {
    return projectRoot ? `?projectRoot=${encodeURIComponent(projectRoot)}` : ''
  }

  /** Capture the workspace when the editor opens and pass it to subsequent requests. */
  function getDrawingScope(projectRoot?: string): Promise<DrawingScope> {
    return scopedFetch(`/api/agent/drawings${scopeQuery(projectRoot)}`).then(json<DrawingScope>)
  }

  async function listDrawings(projectRoot?: string): Promise<DrawingSummary[]> {
    return (await getDrawingScope(projectRoot)).drawings
  }

  function loadDrawing(id: string, projectRoot?: string): Promise<StoredDrawing> {
    return scopedFetch(`/api/agent/drawings/${encodeURIComponent(id)}${scopeQuery(projectRoot)}`).then(json<StoredDrawing>)
  }

  function saveDrawing(svg: string, name: string, projectRoot?: string): Promise<SavedDrawing> {
    return scopedFetch('/api/agent/drawings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ svg, name, ...(projectRoot ? { projectRoot } : {}) }),
    }).then(json<SavedDrawing>)
  }
  return { getDrawingScope, listDrawings, loadDrawing, saveDrawing }
}

export const { getDrawingScope, listDrawings, loadDrawing, saveDrawing } = createDrawingStorage()
