import fs from 'node:fs'
import path from 'node:path'
import { taskDocumentsNeedMigration } from './task-markdown.ts'
import { TASK_DOCUMENT_DIRECTORIES } from '../shared/task-document-paths.ts'
import { taskListFile } from './task-list.ts'
import { readJsonFile } from './dataDir.ts'
import express from 'express'
import { authOf, requireAuthenticated } from './reqAuth.ts'
import { unrestrictedFiles } from './access-policy.ts'
import { WORKSPACE_PROJECT, workspacePaths } from './paths.ts'
import { changeTaskList, readTaskList, readTaskTags, readTaskTagColors, TaskInputError } from './task-list.ts'
import { TaskConflict } from '../shared/task-list.ts'

export function createTaskListRouter() {
  const router = express.Router()
  router.use(requireAuthenticated)
  router.use((req, res, next) => {
    const workspace = req.method === 'GET' ? req.query.workspace : req.body?.workspace
    if (req.headers['x-mew-task-owner'] !== encodeURIComponent(authOf(req).email ?? '')) { res.status(409).json({ error: '계정이 변경되었습니다. 태스크 패널을 다시 여세요.' }); return }
    if (workspace !== workspacePaths.root) { res.status(409).json({ error: '프로젝트가 변경되었습니다. 태스크 패널을 다시 여세요.' }); return }
    if (!unrestrictedFiles(authOf(req), WORKSPACE_PROJECT, req.method !== 'GET')) { res.status(403).json({ error: '권한이 없습니다' }); return }
    next()
  })
  router.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()
    const root = workspacePaths.root
    const watchers = new Map<string, fs.FSWatcher>()
    let timer: ReturnType<typeof setTimeout> | undefined
    const send = () => {
      if (root !== workspacePaths.root || !unrestrictedFiles(authOf(req), WORKSPACE_PROJECT, false)) { res.end(); return }
      res.write('data: changed\n\n')
    }
    const notify = () => { clearTimeout(timer); timer = setTimeout(send, 75) }
    const watchDirectories = new Map<string, Set<string> | null>()
    for (const relative of TASK_DOCUMENT_DIRECTORIES) {
      const segments = relative.split('/')
      for (let index = 0; index <= segments.length; index++) {
        const directory = path.join(root, ...segments.slice(0, index))
        if (index === segments.length) watchDirectories.set(directory, null)
        else if (watchDirectories.get(directory) !== null) {
          const children = watchDirectories.get(directory) ?? new Set<string>()
          children.add(segments[index]); watchDirectories.set(directory, children)
        }
      }
    }
    const attach = () => {
      for (const [dir, children] of watchDirectories) {
        if (!fs.existsSync(dir)) { watchers.get(dir)?.close(); watchers.delete(dir); continue }
        if (watchers.has(dir)) continue
        try {
          const watcher = fs.watch(dir, (_event, name) => {
            if (children && name && !children.has(name.toString())) return
            attach(); notify()
          })
          watcher.on('error', () => { watcher.close(); watchers.delete(dir); notify() })
          watchers.set(dir, watcher)
        } catch { /* Parent watches and polling cover directories not created yet. */ }
      }
    }
    res.on('close', () => { clearTimeout(timer); clearInterval(heartbeat); for (const watcher of watchers.values()) watcher.close() })
    const heartbeat = setInterval(send, 15_000)
    attach(); send()
  })
  router.get('/', (req, res) => {
    try {
      const legacy = readJsonFile<{ version: number }>(taskListFile(workspacePaths.root))
      const canEdit = unrestrictedFiles(authOf(req), WORKSPACE_PROJECT, true)
      const tasks = readTaskList(workspacePaths.root)
      if (canEdit && ((legacy && legacy.version < 5) || taskDocumentsNeedMigration(tasks, workspacePaths.root))) changeTaskList(workspacePaths.root, [])
      res.json({ tasks: readTaskList(workspacePaths.root), tags: readTaskTags(workspacePaths.root), tagColors: readTaskTagColors(workspacePaths.root), canEdit: unrestrictedFiles(authOf(req), WORKSPACE_PROJECT, true) }) }
    catch { res.status(500).json({ error: '태스크를 불러오지 못했습니다' }) }
  })
  router.patch('/', (req, res) => {
    try { res.json({ tasks: changeTaskList(workspacePaths.root, req.body?.changes, req.body?.tagColorChanges, req.body?.deletedTags), tags: readTaskTags(workspacePaths.root), tagColors: readTaskTagColors(workspacePaths.root), canEdit: true }) }
    catch (error) {
      const status = error instanceof TaskConflict ? 409 : error instanceof TaskInputError ? 400 : 500
      res.status(status).json({ error: status === 500 ? '태스크를 저장하지 못했습니다' : (error as Error).message })
    }
  })
  return router
}
