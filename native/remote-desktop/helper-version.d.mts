export const HELPER_FILES: string[]
export function helperVersion(directory: string): string
export function markHelperReady(directory: string, options?: { platform?: string; arch?: string }): void
export function dependenciesCurrent(directory: string): boolean
