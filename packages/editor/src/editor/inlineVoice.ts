import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const inlineVoiceKey = new PluginKey<DecorationSet>('inlineVoice')

// Local decoration: unfinished recordings never enter Markdown or collaboration state.
export const InlineVoice = Extension.create({
  name: 'inlineVoice',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: inlineVoiceKey,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, decorations) {
          const next = tr.getMeta(inlineVoiceKey) as { pos: number; mount: HTMLElement } | null | undefined
          if (next === null) return DecorationSet.empty
          if (next) return DecorationSet.create(tr.doc, [Decoration.widget(next.pos, next.mount, {
            side: -1, stopEvent: () => true, ignoreSelection: true,
          })])
          return decorations.map(tr.mapping, tr.doc)
        },
      },
      props: { decorations: state => inlineVoiceKey.getState(state) },
    })]
  },
})
