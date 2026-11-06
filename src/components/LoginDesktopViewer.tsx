import { BrowserDesktopPanel } from './BrowserDesktopPanel'

/** Login jobs use the same Chrome video and input component as the browser dock. */
export function LoginDesktopViewer({ streamUrl, reopen, onReady }: { streamUrl: string; reopen: () => Promise<string>; onReady?: () => void }) {
  return <BrowserDesktopPanel url="about:blank" streamUrl={streamUrl} reopen={reopen} onReady={onReady} embedded previewAllowed={false} />
}
