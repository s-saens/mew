import { randomId } from '../shared/remote-access-crypto.ts'

type PreparedEntry = { id: string; challenge: string; generation: string; expires: number }
export type RemotePreparePool = { epoch: string; entries: PreparedEntry[] }

/** Unused host contributions only; consuming an entry removes it before RTC starts. */
export function createRemotePreparePool({ now = () => Date.now(), random = randomId }: { now?: () => number; random?: () => string } = {}) {
  let epoch = ''
  const entries = new Map<string, PreparedEntry>()
  const refill = (): RemotePreparePool => {
    const current = now(), added: PreparedEntry[] = []
    for (const [id, entry] of entries) if (entry.expires <= current) entries.delete(id)
    if (epoch) while (entries.size < 8) {
      const entry = { id: random(), challenge: random(), generation: random(), expires: current + 60_000 }
      entries.set(entry.id, entry); added.push(entry)
    }
    return { epoch, entries: added }
  }
  return {
    reset() { epoch = random(); entries.clear(); return refill() },
    refill,
    consume(value: unknown): PreparedEntry | null {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null
      const prepared = value as Record<string, unknown>
      if (prepared.epoch !== epoch || typeof prepared.id !== 'string') return null
      const entry = entries.get(prepared.id)
      if (!entry || entry.expires <= now() || prepared.challenge !== entry.challenge || prepared.generation !== entry.generation) return null
      entries.delete(entry.id)
      return entry
    },
    clear() { epoch = ''; entries.clear() },
  }
}
