import { deferredComponent } from './deferred-component'
import { loadCodeLanguage } from '../utils/code-language'

type HotviewModule = { default: typeof import('@mew/editor')['Editor'] }
type PlainModule = { default: typeof import('./CodePane')['CodePane'] }
let hotview: Promise<HotviewModule> | undefined
let plain: Promise<PlainModule> | undefined
let preparedHotview: HotviewModule | undefined
let preparedPlain: PlainModule | undefined

function loadHotview(): Promise<HotviewModule> {
  return hotview ??= import('@mew/editor').then(module => preparedHotview = { default: module.Editor }, error => { hotview = undefined; throw error })
}

function loadPlain(): Promise<PlainModule> {
  return plain ??= import('./CodePane').then(module => preparedPlain = { default: module.CodePane }, error => { plain = undefined; throw error })
}

/** Prepare public code only; the pane still owns content, authorization and mounting. */
export function prepareEditorView(mode: 'plain' | 'hotview', path: string): Promise<unknown> {
  return mode === 'plain' ? Promise.all([loadPlain(), loadCodeLanguage(path)]) : loadHotview()
}

export const DeferredHotviewEditor = deferredComponent(loadHotview, undefined, { suspend: false, prepared: () => preparedHotview?.default })
export const DeferredCodePane = deferredComponent(loadPlain, undefined, { suspend: false, prepared: () => preparedPlain?.default })
