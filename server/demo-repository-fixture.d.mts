import type { Buffer } from 'node:buffer'
import type { DemoRepositoryIndex } from '../src/demo/repository.ts'

export interface DemoRepositoryFixture {
  fixtureProvenance?: {
    source: 'fixed-published-artifact'
    revision: string
    snapshotId: string
    publishedRelative: string
    gitTreeVerified: false
  }
  has(oid: string): boolean
  isBinary(oid: string): boolean
  rawExtensions(oid: string): string[]
  load(oid: string): string
  loadRaw(oid: string): { bytes: Buffer; contentType: string }
  loadBinary(oid: string): { bytes: Buffer; contentType: string }
  objects(): IterableIterator<[string, string]>
}

export function createDemoRepositoryFixture(index: DemoRepositoryIndex, root: string): Promise<DemoRepositoryFixture>
