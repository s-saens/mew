import type { PublicShareFile } from '../api/public-share-content.ts'

export interface PublicShareDocumentState {
  file: PublicShareFile
  draft: string
  saving: boolean
  error: unknown
}

/** Serial saves preserve edits entered while a previous revision is in flight. */
export class PublicShareDocument {
  state: PublicShareDocumentState
  private listeners = new Set<() => void>()
  private pending: Promise<boolean> | null = null
  private write: (content: string, version: PublicShareFile['version']) => Promise<PublicShareFile>
  constructor(file: PublicShareFile, write: (content: string, version: PublicShareFile['version']) => Promise<PublicShareFile>) {
    this.write = write
    this.state = { file, draft: file.content, saving: false, error: null }
  }
  get dirty(): boolean { return this.state.draft !== this.state.file.content }
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getSnapshot = (): PublicShareDocumentState => this.state
  private publish(change: Partial<PublicShareDocumentState>) {
    this.state = { ...this.state, ...change }
    for (const listener of this.listeners) listener()
  }
  change = (draft: string) => { this.publish({ draft }) }
  save = (): Promise<boolean> => {
    if (this.pending) return this.pending
    if (!this.dirty) return Promise.resolve(true)
    this.publish({ saving: true, error: null })
    this.pending = this.flush().finally(() => { this.pending = null; this.publish({ saving: false }) })
    return this.pending
  }
  private async flush(): Promise<boolean> {
    while (this.dirty) {
      const draft = this.state.draft
      try {
        const file = await this.write(draft, this.state.file.version)
        this.publish({ file: { ...this.state.file, ...file, content: draft }, error: null })
      } catch (error) { this.publish({ error }); return false }
    }
    return true
  }
}
