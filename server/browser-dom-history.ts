type HistoryEntry = Readonly<{ url: string; runtimeId: number }>

/** Retain toolbar visits across host browser runtime changes. */
export class DomBrowserHistory {
  private entries: HistoryEntry[] = []
  private index = -1

  get current(): HistoryEntry | undefined { return this.entries[this.index] }
  get currentIndex(): number { return this.index }
  get canGoBack(): boolean { return this.index > 0 }
  get canGoForward(): boolean { return this.index >= 0 && this.index < this.entries.length - 1 }

  target(direction: 'back' | 'forward'): { index: number; entry: HistoryEntry } | undefined {
    const index = this.index + (direction === 'back' ? -1 : 1)
    const entry = this.entries[index]
    return entry ? { index, entry } : undefined
  }

  record(url: string, runtimeId: number, replaceIndex?: number, forceAppend = false): void {
    if (!url || url === 'about:blank') return
    if (replaceIndex !== undefined) {
      if (!Number.isInteger(replaceIndex) || replaceIndex < 0 || replaceIndex >= this.entries.length) {
        throw new RangeError('DOM browser history replacement index is out of bounds.')
      }
      this.entries[replaceIndex] = { url, runtimeId }
      this.index = replaceIndex
      return
    }
    if (!forceAppend && this.current?.url === url) {
      this.entries[this.index] = { url, runtimeId }
      return
    }
    this.entries.splice(this.index + 1)
    this.entries.push({ url, runtimeId })
    this.index = this.entries.length - 1
  }
}
