import { deferredComponent } from './deferred-component'

export const DeferredAgentTerminal = deferredComponent(async () => ({ default: (await import('@mew/tmux-term')).TmuxTerminal }), undefined, { suspend: false })
