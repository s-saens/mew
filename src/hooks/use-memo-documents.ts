import { useEffect, useRef, useState } from 'react'
import { PRIVATE_MEMO_PROJECT, privateMemoPath, SHARED_MEMO_PATH, SHARED_MEMO_PROJECT } from '../../shared/shared-memo'
import { connectCollab, type Collab } from '../utils/collab-connection'
import { openMewSocket } from '../utils/remote-transport'

type MemoDocument = { collab: Collab; value: string }

/** Visited documents keep their CRDT and pending edits until deletion or account exit. */
export function useMemoDocuments(account: string, ownerId: string, ids: string[], activated: boolean, selected: string) {
  const connections = useRef(new Map<string, { stop: () => void }>())
  const [state, setState] = useState({ account, documents: {} as Record<string, MemoDocument> })
  const key = JSON.stringify(ids)
  useEffect(() => {
    const live = connections.current
    setState({ account, documents: {} })
    return () => { for (const connection of live.values()) connection.stop(); live.clear() }
  }, [account])
  useEffect(() => {
    if (!account || !activated) return
    const wanted = new Set<string>(JSON.parse(key))
    wanted.add(SHARED_MEMO_PATH)
    for (const [id, connection] of connections.current) if (!wanted.has(id)) {
      connection.stop(); connections.current.delete(id)
      setState(old => { const documents = { ...old.documents }; delete documents[id]; return { account, documents } })
    }
    for (const id of wanted) {
      if (connections.current.has(id) || (id !== SHARED_MEMO_PATH && !ownerId)) continue
      const stop = connectCollab({
        project: id === SHARED_MEMO_PATH ? SHARED_MEMO_PROJECT : PRIVATE_MEMO_PROJECT,
        path: id === SHARED_MEMO_PATH ? id : privateMemoPath(ownerId, id),
        authEmail: account, openSocket: openMewSocket,
      }, collab => setState(old => ({ account, documents: { ...old.documents, [id]: { collab, value: old.account === account ? old.documents[id]?.value ?? '' : '' } } })))
      connections.current.set(id, { stop })
    }
  }, [account, ownerId, key, activated])
  const active = state.account === account ? state.documents[selected] : undefined
  const setDocumentValue = (id: string, value: string) => setState(old => {
    const document = old.documents[id]
    return old.account === account && document && document.value !== value ? { ...old, documents: { ...old.documents, [id]: { ...document, value } } } : old
  })
  return { collab: active?.collab ?? null, value: active?.value ?? '', setValue: (value: string) => setDocumentValue(selected, value), setDocumentValue,
    documents: state.account === account ? state.documents : {} }
}
