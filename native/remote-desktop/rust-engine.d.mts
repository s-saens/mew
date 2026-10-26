export function rustLibrary(platform?: string): string
import type { EventEmitter } from 'node:events'
export function rustEngine(koffi: unknown, directory?: string): EventEmitter & { threadId: number; postMessage(value: unknown): void; terminate(): Promise<void> }
