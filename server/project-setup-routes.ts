import express from 'express'
import { createHash } from 'node:crypto'
import { requireRole } from './reqAuth.ts'
import { workspacePaths } from './paths.ts'
import { switchDocsRoot } from './workspace.ts'
import { broadcast } from './presence.ts'
import { resetTreeWatchers } from './watcher.ts'
import { applyProjectSetup, defaultAgentSettings, planProjectSetup, readProjectAgentSettings } from './project-setup.ts'
import { writeProjectAgentSettings } from './project-agent-settings.ts'

function guidanceSnapshot() {
  const projectRoot = workspacePaths.root
  const settings = readProjectAgentSettings(projectRoot) ?? defaultAgentSettings(workspacePaths.docsDir)
  return { projectRoot, settings, revision: createHash('sha256').update(JSON.stringify(settings)).digest('hex') }
}

export function createProjectSetupRouter() {
  const router = express.Router()
  router.use(requireRole('owner'))
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  router.get('/', (_req, res) => {
    try { res.json(guidanceSnapshot()) }
    catch (error) { res.status(400).json({ error: (error as Error).message }) }
  })
  router.patch('/', (req, res) => {
    if (req.body?.projectRoot !== workspacePaths.root) {
      res.status(409).json({ error: '프로젝트가 변경되었습니다. 설정 창을 다시 여세요.' }); return
    }
    if (typeof req.body.instructions !== 'string' || req.body.instructions.length > 8000
      || (req.body.enabled !== undefined && typeof req.body.enabled !== 'boolean')) {
      res.status(400).json({ error: '프로젝트 지침은 최대 8,000자로 입력하세요.' }); return
    }
    try {
      const current = guidanceSnapshot()
      if (req.body.revision !== current.revision) {
        res.status(409).json({ error: '프로젝트 지침이 변경되었습니다. 다시 불러온 뒤 저장하세요.' }); return
      }
      writeProjectAgentSettings(current.projectRoot, { ...current.settings, instructions: req.body.instructions, enabled: req.body.enabled ?? current.settings.enabled })
      res.json(guidanceSnapshot())
    } catch (error) { res.status(400).json({ error: (error as Error).message }) }
  })
  router.post('/', (req, res) => {
    if (req.body?.projectRoot !== workspacePaths.root) {
      res.status(409).json({ error: '프로젝트가 변경되었습니다. 설정 창을 다시 여세요.' }); return
    }
    if (!['preview', 'apply'].includes(req.body?.action)) {
      res.status(400).json({ error: '미리보기 또는 적용을 선택하세요' }); return
    }
    try {
      const input = { projectRoot: workspacePaths.root, settings: req.body.settings, initDocs: req.body.initDocs === true, exportAgents: req.body.exportAgents === true }
      const plan = req.body.action === 'apply' ? applyProjectSetup(input, req.body.revision) : planProjectSetup(input)
      if (req.body.action === 'apply') {
        switchDocsRoot(`${plan.projectRoot}/${plan.settings.docsDir}`)
        resetTreeWatchers()
        broadcast({ type: 'tree' })
      }
      res.json(plan)
    } catch (error) { res.status(400).json({ error: (error as Error).message }) }
  })
  return router
}
