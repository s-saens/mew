import { StateEffect, type Extension } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { isolateHistory } from '@codemirror/commands'
import { createRoot, type Root } from 'react-dom/client'
import { documentReferenceTokens } from '../utils/agent-attachments'
import { AgentDocumentTag, type OpenAgentDocument } from './agent-document-tag'

export const refreshComposerDocuments = StateEffect.define<null>()
type DocumentReference = ReturnType<typeof documentReferenceTokens>[number]

class DocumentWidget extends WidgetType {
  private root?: Root
  readonly reference: DocumentReference
  readonly open: () => OpenAgentDocument | undefined
  constructor(reference: DocumentReference, open: () => OpenAgentDocument | undefined) {
    super()
    this.reference = reference
    this.open = open
  }
  eq(other: DocumentWidget) { return this.reference.token === other.reference.token }
  toDOM(view: EditorView) {
    const dom = view.dom.ownerDocument.createElement('span')
    dom.dataset.documentToken = this.reference.token
    dom.contentEditable = 'false'
    this.root = createRoot(dom)
    this.root.render(<AgentDocumentTag project={this.reference.project} path={this.reference.path}
      onOpenFile={(...args) => this.open()?.(...args)} onRemove={() => {
        const from = view.posAtDOM(dom)
        view.dispatch({ changes: { from, to: from + this.reference.token.length }, selection: { anchor: from },
          userEvent: 'delete', annotations: isolateHistory.of('full') })
        view.focus()
      }} />)
    return dom
  }
  destroy() {
    const root = this.root
    queueMicrotask(() => root?.unmount())
  }
  ignoreEvent() { return true }
}

export function composerDocuments(open: () => OpenAgentDocument | undefined): Extension {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet = Decoration.none
    constructor(view: EditorView) { this.rebuild(view) }
    rebuild(view: EditorView) {
      this.decorations = Decoration.set(open() ? documentReferenceTokens(view.state.doc.toString()).map(reference =>
        Decoration.replace({ widget: new DocumentWidget(reference, open) }).range(reference.from, reference.to)) : [])
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.transactions.some(transaction => transaction.effects.some(effect => effect.is(refreshComposerDocuments)))) this.rebuild(update.view)
    }
  }, { decorations: value => value.decorations,
    provide: plugin => EditorView.atomicRanges.of(view => view.plugin(plugin)?.decorations ?? Decoration.none) })
}
