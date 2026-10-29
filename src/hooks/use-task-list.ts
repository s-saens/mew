import { globalSessionStorage } from '@mew/ui/browser-storage-scope'
import { mewFetch } from '../utils/remote-transport.ts'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { fetchTaskList, patchTaskList } from '../api/client'
import { TaskListSession } from '../utils/task-list-session'
import { uuid } from '../utils/uuid'
import { syncTaskDocuments, withTaskDocumentSync } from '../utils/task-document-sync'
import type { TaskBoard, TaskItem } from '../../shared/task-list'
import { previewDocumentTitle, useTitlePreviews } from '../utils/document-title-preview'

export function useTaskList(workspace: string | null, email: string, open: boolean) {
  const [draftWindow] = useState(() => {
    const id = uuid()
    try {
      const existing = globalSessionStorage().getItem('mew:task-draft-window')
      if (existing) return existing
      globalSessionStorage().setItem('mew:task-draft-window', id)
    } catch { /* Drafts still remain separate in memory. */ }
    return id
  })
  const sessions = useRef(new Map<string, TaskListSession>())
  const session = useMemo(() => {
    const key = `${email}:${workspace}`
    let value = sessions.current.get(key)
    if (!value) {
      const confirmed = { tasks: [] as TaskItem[] }
      const receive = async (board: TaskBoard) => {
        const previous = confirmed.tasks
        try {
          await syncTaskDocuments(workspace ?? '', previous, board.tasks)
          confirmed.tasks = board.tasks
        } catch { /* Retry editor reads on the next board refresh without resending a successful task save. */ }
        return board
      }
      value = new TaskListSession({
        read: () => withTaskDocumentSync(workspace ?? '', () => fetchTaskList(workspace ?? '', email).then(receive), 'read'),
        save: (changes, colors, deleted) => withTaskDocumentSync(workspace ?? '', () => patchTaskList(workspace ?? '', changes, email, colors, deleted).then(receive)),
      }, `mew:task-draft:${key}:${draftWindow}`)
      sessions.current.set(key, value)
    }
    return value
  }, [email, workspace, draftWindow])
  const state = useSyncExternalStore(session.subscribe, session.snapshot)
  const titles = useTitlePreviews()
  const displayed = state.tasks.map(task => {
    const title = task.path ? titles[`${workspace}/${task.path}`]?.title : undefined
    return title !== undefined && title !== task.text ? { ...task, text: title } : task
  })
  const edit = (tasks: typeof state.tasks) => {
    const next = tasks.map(task => {
      const original = state.tasks.find(item => item.id === task.id), shown = displayed.find(item => item.id === task.id)
      // A checkbox/tag edit must not turn an editor-owned title preview into a second task write.
      if (original && shown && task.text === shown.text && shown.text !== original.text) return { ...task, text: original.text }
      if (workspace && original?.path && original.text !== task.text) previewDocumentTitle(`${workspace}/${original.path}`, task.text, 'task')
      return task
    })
    session.edit(next)
  }
  useEffect(() => {
    if (!open || !workspace || !email) return
    void session.refresh()
    const controller = new AbortController()
    const stream = async () => {
      try {
        const response = await mewFetch(`/api/task-list/events?workspace=${encodeURIComponent(workspace)}`, { headers: { 'X-Mew-Task-Owner': encodeURIComponent(email) }, signal: controller.signal })
        if (!response.ok || !response.body) return
        const reader = response.body.getReader(), decoder = new TextDecoder()
        let buffered = ''
        while (!controller.signal.aborted) {
          const { done, value } = await reader.read()
          if (done) break
          buffered += decoder.decode(value, { stream: true })
          let boundary: number
          while ((boundary = buffered.indexOf('\n\n')) >= 0) {
            if (buffered.slice(0, boundary).startsWith('data:')) void session.refresh()
            buffered = buffered.slice(boundary + 2)
          }
        }
      } catch { /* Periodic refresh covers unavailable streams and reconnects. */ }
    }
    void stream()
    const timer = setInterval(() => { void session.refresh() }, 3000)
    const refresh = () => { if (!document.hidden) void session.refresh() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [session, open, workspace, email])
  useEffect(() => {
    for (const [key, value] of sessions.current) if (!key.startsWith(`${email}:`)) { value.dispose(); sessions.current.delete(key) }
  }, [email])
  return { ...state, tasks: displayed, deleteTag: (tag: string) => session.deleteTag(tag), setTagColor: (tag: string, hue: number) => session.setTagColor(tag, hue), edit, setDraft: (text: string) => session.setDraft(text), setDraftAssignees: (assignees: string[]) => session.setDraftAssignees(assignees), setDraftTags: (tags: string[]) => session.setDraftTags(tags), flush: () => session.flush(), retry: () => session.retry() }
}
