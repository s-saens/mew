import { createContext, type ReactNode } from 'react'
import type { EditorDrawingOptions } from '../types'

export const ImageSourceContext = createContext<(src: string) => string>(src => src)

export const ImageEditingContext = createContext<{
  scope: object
  renderDrawingEditor?: (options: EditorDrawingOptions) => ReactNode
  upload: (file: File) => Promise<{ url: string }>
} | null>(null)
