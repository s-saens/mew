import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { agentInputOwnerKey, readAgentInputDraft, writeAgentInputDraft, type AgentInputDraftScope } from '../utils/agentInputDrafts'

/** Draft state follows its owner, and delayed setters from a previous owner cannot replace it. */
export function useAgentInputDraft(tabId: string, scope: AgentInputDraftScope): readonly [string, Dispatch<SetStateAction<string>>] {
  const owner = agentInputOwnerKey(tabId, scope)
  const load = () => readAgentInputDraft(tabId, scope).replace(/\[\[mew-upload:[^\]\n]+\]\]/g, '')
  const [saved, setSaved] = useState(() => ({ owner, text: load() }))
  const current = saved.owner === owner ? saved : { owner, text: load() }
  if (saved.owner !== owner) setSaved(current)
  const setDraft = useCallback<Dispatch<SetStateAction<string>>>(change => {
    setSaved(previous => previous.owner !== owner ? previous : {
      owner,
      text: typeof change === 'function' ? change(previous.text) : change,
    })
  }, [owner])
  useEffect(() => { writeAgentInputDraft(tabId, current.text, scope) }, [tabId, owner, current.text, scope])
  return [current.text, setDraft]
}
