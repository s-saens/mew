export const DOM_BROWSER_WS = '/api/dom-browser/ws'

export type DomBrowserCommand =
  | { type: 'navigate'; url: string }
  | { type: 'resize'; width: number; height: number }
  | { type: 'click'; generation: number; id: number }
  | { type: 'focus'; generation: number; id: number }
  | { type: 'input'; generation: number; id: number; value: string; checked?: boolean }
  | { type: 'scroll'; generation: number; id: number; x: number; y: number; scrollRevision?: number }
  | { type: 'key'; generation: number; key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean }
  | { type: 'back' | 'forward' | 'reload' }

export type DomBrowserState = { type: 'state'; generation: number; url: string; title: string; loading: boolean; canGoBack?: boolean; canGoForward?: boolean }
export type DomBrowserMessage =
  | { type: 'events'; generation: number; events: unknown[] }
  | DomBrowserState
  | { type: 'error'; message: string }
