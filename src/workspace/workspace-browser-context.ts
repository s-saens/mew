import { createContext, useContext } from 'react'

export const BrowserContext = createContext<((url?: string) => void) | null>(null)

export function useWorkspaceBrowser() { return useContext(BrowserContext) }
