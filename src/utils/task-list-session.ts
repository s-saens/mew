import { scopedBrowserStorage } from '@mew/ui/browser-storage-scope'
import { sameAssignees, taskAssignees, validAssignees } from '../../shared/task-assignees.ts'
import { applyTagColorChanges, removeTagColors, tagColorChanges, tagColor, validTagColor, validTagColors, type TaskTagColors, type TaskTagColorChange } from '../../shared/task-tag-colors.ts'
import { applyTaskChanges, taskChanges, taskParent, taskDate, taskStartDate, validTaskTree, TaskConflict, type TaskBoard, type TaskChange, type TaskItem } from '../../shared/task-list.ts'
import { taskRollups, taskWithRollup } from '../../shared/task-rollup.ts'
import { sameTags, taskTags, validTags, validTag, validDeletedTags, removeTaskTags } from '../../shared/task-tags.ts'
import { writeBrowserStorage } from '@mew/ui/browser-storage'

type TaskApi = { read: () => Promise<TaskBoard>; save: (changes: TaskChange[], colors?: TaskTagColorChange[], deletedTags?: string[]) => Promise<TaskBoard> }
type State = TaskBoard & { tagColors: TaskTagColors; loading: boolean; saving: boolean; error: string | null; draft: string; draftTags: string[]; draftAssignees: string[] }
type PendingSave = { sent: TaskItem[]; changes: TaskChange[]; sentColors: TaskTagColors; colors: TaskTagColorChange[]; deleted: string[] }

function transientTaskError(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status
  return !(error instanceof TaskConflict || error instanceof SyntaxError) && (status == null || status < 400 || status >= 500)
}

/** Lives above the project-keyed dock so closing/remounting a panel cannot discard pending edits. */
export class TaskListSession {
  state: State = { tagColors: {}, tasks: [], canEdit: false, loading: true, saving: false, error: null, draft: '', draftTags: [], draftAssignees: [] }
  private baseline: TaskItem[] = []
  private baselineColors: TaskTagColors = {}
  private deletedTags = new Set<string>()
  private listeners = new Set<() => void>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private readTimer: ReturnType<typeof setTimeout> | undefined
  private reading = false
  private pendingSave?: PendingSave
  private saveRetries = 0
  private readRetries = 0
  private readError = false
  private disposed = false
  private api: TaskApi
  private draftKey?: string
  constructor(api: TaskApi, draftKey?: string) {
    this.api = api
    this.draftKey = draftKey
    try {
      const draft = draftKey ? JSON.parse(scopedBrowserStorage().getItem(draftKey) ?? 'null') : null
      const validItems = (items: unknown): items is TaskItem[] => Array.isArray(items) && items.length <= 2000 && items.every(item => item && typeof item.id === 'string' && typeof item.text === 'string' && typeof item.done === 'boolean' && (item.parentId == null || typeof item.parentId === 'string')) && validTaskTree(items)
      if (validItems(draft?.baseline) && validItems(draft?.tasks)) {
        const flatten = (items: TaskItem[]) => { const rollups = taskRollups(items); return items.map(item => { const { parentId: _parentId, ...task } = taskWithRollup(item, rollups); return task }) }
        this.baseline = flatten(draft.baseline)
        this.deletedTags = new Set(validDeletedTags(draft.deletedTags) ? draft.deletedTags : [])
        this.baselineColors = validTagColors(draft.baselineColors) ? draft.baselineColors : {}
        this.state = { ...this.state, tasks: flatten(draft.tasks), tagColors: validTagColors(draft.tagColors) ? draft.tagColors : {}, draft: typeof draft.draft === 'string' ? draft.draft : '', draftTags: validTags(draft.draftTags) ? draft.draftTags : [], draftAssignees: validAssignees(draft.draftAssignees) ? draft.draftAssignees : [] }
      }
    } catch { /* Invalid or unavailable browser storage. */ }
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  snapshot = () => this.state
  private publish(patch: Partial<State>) {
    if (this.disposed) return
    this.state = { ...this.state, ...patch }
    if (this.draftKey) try {
      if (this.state.draft || this.state.draftTags.length || this.state.draftAssignees.length || taskChanges(this.baseline, this.state.tasks).length || tagColorChanges(this.baselineColors, this.state.tagColors).length || this.deletedTags.size) writeBrowserStorage(this.draftKey, JSON.stringify({ deletedTags: [...this.deletedTags], baseline: this.baseline, baselineColors: this.baselineColors, tagColors: this.state.tagColors, tasks: this.state.tasks, draft: this.state.draft, draftTags: this.state.draftTags, draftAssignees: this.state.draftAssignees }))
      else scopedBrowserStorage().removeItem(this.draftKey)
    } catch { /* In-memory drafts remain available when storage is full. */ }
    for (const listener of this.listeners) listener()
  }
  private schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => { void this.flush() }, 350) }
  edit(tasks: TaskItem[]) {
    if (!this.state.canEdit || this.disposed) return
    this.publish({ tasks })
    if (!this.state.error && !this.pendingSave) this.schedule()
  }
  deleteTag(tag: string) {
    if (!this.state.canEdit || this.disposed || !validTag(tag)) return
    this.deletedTags.add(tag)
    this.publish({ tasks: removeTaskTags(this.state.tasks, [tag]), tags: this.state.tags?.filter(value => value !== tag),
      draftTags: this.state.draftTags.filter(value => value !== tag), tagColors: removeTagColors(this.state.tagColors, [tag]) })
    if (!this.state.error && !this.pendingSave) this.schedule()
  }
  private changes(before: TaskItem[], after: TaskItem[]) { return taskChanges(removeTaskTags(before, this.deletedTags), removeTaskTags(after, this.deletedTags)) }
  setTagColor(tag: string, hue: number) {
    if (!this.state.canEdit || this.disposed || !validTag(tag) || !validTagColor(hue)) return
    this.publish({ tagColors: { ...this.state.tagColors, [tag]: hue } })
    if (!this.state.error && !this.pendingSave) this.schedule()
  }
  setDraft(draft: string) { if (this.state.canEdit) this.publish({ draft }) }
  setDraftAssignees(draftAssignees: string[]) { if (this.state.canEdit && validAssignees(draftAssignees)) this.publish({ draftAssignees }) }
  setDraftTags(draftTags: string[]) { if (this.state.canEdit) this.publish({ draftTags }) }
  async refresh() {
    if (this.disposed || this.reading || this.readTimer !== undefined || this.state.saving || this.pendingSave || (this.state.error && !this.readError)
      || (!this.readError && !this.state.loading && (this.deletedTags.size || taskChanges(this.baseline, this.state.tasks).length || tagColorChanges(this.baselineColors, this.state.tagColors).length))) return
    this.reading = true
    // Edits made while a polling request is in flight must also survive its response.
    const before = this.baseline
    const beforeColors = this.baselineColors
    try {
      const board = await this.api.read()
      if (this.disposed) return
      const pending = this.changes(before, this.state.tasks)
      const tasks = removeTaskTags(applyTaskChanges(removeTaskTags(board.tasks, this.deletedTags), pending), this.deletedTags)
      const pendingColors = tagColorChanges(beforeColors, this.state.tagColors)
      const tagColors = removeTagColors(applyTagColorChanges(board.tagColors ?? {}, pendingColors), this.deletedTags)
      this.baseline = board.tasks
      this.baselineColors = board.tagColors ?? {}
      this.readRetries = 0
      this.readError = false
      this.publish({ ...board, tags: board.tags?.filter(tag => !this.deletedTags.has(tag)), tasks, tagColors, loading: false, error: null })
      if ((pending.length || pendingColors.length || this.deletedTags.size) && board.canEdit) this.schedule()
    } catch (error) {
      if (this.disposed) return
      this.readError = !(error instanceof TaskConflict)
      if (transientTaskError(error) && this.readRetries < 2) {
        const delay = [1000, 3000][this.readRetries++]
        this.readTimer = setTimeout(() => { this.readTimer = undefined; void this.refresh() }, delay)
      } else this.publish({ loading: false, error: (error as Error).message })
    }
    finally { this.reading = false }
  }
  private acceptSave(board: TaskBoard, request: PendingSave) {
    for (const tag of request.deleted) this.deletedTags.delete(tag)
    const pending = this.changes(request.sent, this.state.tasks)
    const tasks = removeTaskTags(applyTaskChanges(removeTaskTags(board.tasks, this.deletedTags), pending), this.deletedTags)
    const pendingColors = tagColorChanges(request.sentColors, this.state.tagColors)
    const tagColors = removeTagColors(applyTagColorChanges(board.tagColors ?? {}, pendingColors), this.deletedTags)
    this.baseline = board.tasks
    this.baselineColors = board.tagColors ?? {}
    this.pendingSave = undefined
    this.saveRetries = 0
    this.readRetries = 0
    this.readError = false
    clearTimeout(this.readTimer)
    this.readTimer = undefined
    this.publish({ ...board, tags: board.tags?.filter(tag => !this.deletedTags.has(tag)), tasks, tagColors, saving: false, error: null })
    if (pending.length || pendingColors.length || this.deletedTags.size) this.schedule()
  }
  private saveApplied(board: TaskBoard, request: PendingSave): boolean {
    try {
      if (taskChanges(board.tasks, applyTaskChanges(board.tasks, request.changes)).length) return false
      if (tagColorChanges(board.tagColors ?? {}, applyTagColorChanges(board.tagColors ?? {}, request.colors)).length) return false
      return request.deleted.every(tag => !board.tags?.includes(tag) && tagColor(board.tagColors ?? {}, tag) === null && board.tasks.every(task => !taskTags(task).includes(tag)))
    } catch { return false }
  }
  async flush() {
    clearTimeout(this.timer)
    if (this.disposed || this.reading || this.state.loading || this.state.saving || this.state.error || !this.state.canEdit) return
    const sent = this.pendingSave?.sent ?? this.state.tasks
    const changes = this.pendingSave?.changes ?? this.changes(this.baseline, sent)
    const sentColors = this.pendingSave?.sentColors ?? this.state.tagColors
    const colors = this.pendingSave?.colors ?? tagColorChanges(this.baselineColors, sentColors)
    const deleted = this.pendingSave?.deleted ?? [...this.deletedTags]
    if (!changes.length && !colors.length && !deleted.length) return
    this.pendingSave = { sent, changes, sentColors, colors, deleted }
    this.publish({ saving: true })
    try {
      const board = await this.api.save(changes, colors, deleted)
      if (this.disposed) return
      this.acceptSave(board, this.pendingSave)
    } catch (error) {
      if (this.disposed) return
      const transient = transientTaskError(error)
      if (transient && this.saveRetries < 2) {
        // Resend the identical batch if the server saved it but its response was lost.
        const delay = [1000, 3000][this.saveRetries++]
        this.publish({ saving: false })
        this.timer = setTimeout(() => { void this.flush() }, delay)
      } else {
        if (transient) try {
          // A failed response does not prove that the write failed. Confirm the batch before warning.
          const board = await this.api.read()
          if (this.disposed) return
          if (this.pendingSave && this.saveApplied(board, this.pendingSave)) {
            this.acceptSave(board, this.pendingSave)
            return
          }
        } catch { /* Preserve the pending batch if confirmation is unavailable or conflicts. */ }
        this.readError = false
        this.publish({ saving: false, error: (error as Error).message })
      }
    }
  }
  async retry() {
    if (this.disposed || this.reading || this.state.saving) return
    clearTimeout(this.readTimer)
    this.readTimer = undefined
    this.reading = true
    try {
      const board = await this.api.read()
      if (this.disposed) return
      const pending = this.changes(this.baseline, this.state.tasks)
      // Explicit retry keeps local changed fields and preserves unrelated remote fields.
      const rebased = pending.map(change => {
        const current = board.tasks.find(item => item.id === change.id) ?? null
        if (!change.after || !change.before || !current) return { ...change, before: current }
        return { ...change, before: current, after: { ...current,
          text: change.after.text !== change.before.text ? change.after.text : current.text,
          tags: !sameTags(change.after.tags, change.before.tags) ? taskTags(change.after) : taskTags(current),
          assignees: !sameAssignees(change.after.assignees, change.before.assignees) ? taskAssignees(change.after) : taskAssignees(current),
          done: change.after.done !== change.before.done ? change.after.done : current.done,
          date: taskDate(change.after) !== taskDate(change.before) ? taskDate(change.after) : taskDate(current),
          startDate: taskStartDate(change.after) !== taskStartDate(change.before) ? taskStartDate(change.after) : taskStartDate(current),
          parentId: taskParent(change.after) !== taskParent(change.before) ? taskParent(change.after) : taskParent(current) } }
      }).filter(change => change.before || change.after)
      const tasks = removeTaskTags(applyTaskChanges(board.tasks, rebased), this.deletedTags)
      const colors = tagColorChanges(this.baselineColors, this.state.tagColors).map(change => ({ ...change, before: tagColor(board.tagColors ?? {}, change.tag) }))
      const tagColors = removeTagColors(applyTagColorChanges(board.tagColors ?? {}, colors), this.deletedTags)
      this.baselineColors = board.tagColors ?? {}
      this.baseline = board.tasks
      this.pendingSave = undefined
      this.saveRetries = 0
      this.readRetries = 0
      this.readError = false
      this.publish({ ...board, tags: board.tags?.filter(tag => !this.deletedTags.has(tag)), tasks, tagColors, error: null, loading: false })
    } catch (error) { this.publish({ error: (error as Error).message }) }
    finally { this.reading = false }
    await this.flush()
  }
  dispose() { this.disposed = true; clearTimeout(this.timer); clearTimeout(this.readTimer); this.listeners.clear() }
}
