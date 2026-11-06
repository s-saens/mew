import { parseLoginDesktopInput, type LoginDesktopInput } from './login-desktop.ts'

export const BROWSER_DESKTOP_WS = '/api/browser-desktop/ws'
export type BrowserDesktopCommand =
  | { type: 'open'; url: string; width: number; height: number }
  | { type: 'navigate'; url: string }
  | { type: 'answer'; sdp: string; negotiation?: number }
  | { type: 'candidate'; candidate: { candidate: string; sdpMid?: string }; negotiation?: number }
  | LoginDesktopInput

export function browserDesktopCommand(raw: string): BrowserDesktopCommand {
  if (new TextEncoder().encode(raw).byteLength > 32 * 1024) throw new Error('브라우저 요청이 너무 큽니다.')
  const value = JSON.parse(raw)
  if (!value || typeof value !== 'object') throw new Error('잘못된 브라우저 요청입니다.')
  if ((value.type === 'open' || value.type === 'navigate') && typeof value.url === 'string' && value.url.length <= 8192) {
    if (value.type === 'navigate') return { type: 'navigate', url: value.url }
    const size = parseLoginDesktopInput({ type: 'resize', width: value.width, height: value.height })
    if (size.type === 'resize') return { type: 'open', url: value.url, width: size.width, height: size.height }
  }
  const negotiation = value.negotiation
  if (negotiation !== undefined && (!Number.isSafeInteger(negotiation) || negotiation < 0)) throw new Error('잘못된 영상 협상입니다.')
  if (value.type === 'answer' && typeof value.sdp === 'string' && value.sdp.length <= 30 * 1024) return { type: 'answer', sdp: value.sdp, negotiation }
  if (value.type === 'candidate' && value.candidate && typeof value.candidate.candidate === 'string' && value.candidate.candidate.length <= 4096 && (value.candidate.sdpMid === undefined || typeof value.candidate.sdpMid === 'string' && value.candidate.sdpMid.length <= 64)) return { type: 'candidate', candidate: value.candidate, negotiation }
  return parseLoginDesktopInput(value)
}
