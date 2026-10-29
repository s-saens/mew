import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

// A local widget keeps unfinished names out of Markdown, autosave, and collaboration.
export const inlinePageNameKey = new PluginKey<DecorationSet>('inlinePageName')

export const InlinePageName = Extension.create({
  name: 'inlinePageName',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: inlinePageNameKey,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, decorations) {
          const next = tr.getMeta(inlinePageNameKey) as { pos: number; mount: HTMLElement } | null | undefined
          if (next === null) return DecorationSet.empty
          if (next) return DecorationSet.create(tr.doc, [Decoration.widget(next.pos, next.mount, {
            side: -1, stopEvent: () => true, ignoreSelection: true,
          })])
          return decorations.map(tr.mapping, tr.doc)
        },
      },
      props: { decorations: state => inlinePageNameKey.getState(state) },
    })]
  },
})
