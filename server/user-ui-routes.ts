import express from 'express'
import { authOf, requireAuthenticated, requireAnyFeature } from './reqAuth.ts'
import { readAccountTheme, writeAccountTheme, readAgentSessionClaims, readAgentTabs, readEditorTabs, readRootProjects, readWorkspaceUi, writeEditorTabs, writeRootProjects, writeWorkspaceUi } from './userUiState.ts'
import { readRootProjectIcons } from './projectIcons.ts'
import { broadcastAccount } from './presence.ts'
import { saveAgentTabs } from './agent-tab-state.ts'

/** Account UI persistence uses the request identity and the API's existing error policy. */
export function createUserUiRouter(handleError: (res: express.Response, error: unknown) => void): express.Router {
  const router = express.Router()

  router.get('/theme', requireAuthenticated, (req, res) => {
    try { res.json({ state: readAccountTheme(authOf(req).email!) }) }
    catch (err) { handleError(res, err) }
  })

  router.put('/theme', requireAuthenticated, (req, res) => {
    try {
      const email = authOf(req).email!
      const state = writeAccountTheme(email, req.body?.state, req.body?.initialize === true)
      broadcastAccount(email, { type: 'theme' })
      res.json({ state })
    } catch (err) { handleError(res, err) }
  })

  router.get('/root-projects', requireAuthenticated, (req, res) => {
    const state = readRootProjects(authOf(req).email!)
    res.json({ state: state ? { ...state, icons: readRootProjectIcons(state.paths, state.icons) } : null })
  })

  router.put('/root-projects', requireAuthenticated, (req, res) => {
    try {
      res.json({ state: writeRootProjects(authOf(req).email!, { ...req.body, icons: {} }) })
    } catch (err) {
      handleError(res, err)
    }
  })

  router.get('/agent-tabs', requireAnyFeature('agent', 'terminal'), (req, res) => {
    try {
      const workspacePath = String(req.query.workspace ?? '')
      const email = authOf(req).email!
      res.json({ state: readAgentTabs(email, workspacePath), claims: readAgentSessionClaims(email) })
    } catch (err) {
      handleError(res, err)
    }
  })

  router.put('/agent-tabs', requireAnyFeature('agent', 'terminal'), async (req, res) => {
    try {
      const email = authOf(req).email!
      const workspacePath = typeof req.body?.workspacePath === 'string' ? req.body.workspacePath : ''
      const state = await saveAgentTabs(email, workspacePath, req.body)
      broadcastAccount(email, { type: 'agent-tabs', workspacePath })
      res.json({ state })
    } catch (err) {
      handleError(res, err)
    }
  })

  router.get('/editor-tabs', requireAuthenticated, (req, res) => {
    try {
      res.json(readEditorTabs(authOf(req).email!, String(req.query.workspace ?? '')))
    } catch (err) {
      handleError(res, err)
    }
  })

  router.put('/editor-tabs', requireAuthenticated, (req, res) => {
    try {
      const email = authOf(req).email!
      const workspacePath = typeof req.body?.workspacePath === 'string' ? req.body.workspacePath : ''
      const project = typeof req.body?.project === 'string' ? req.body.project : ''
      const snapshot = writeEditorTabs(email, workspacePath, project, req.body?.state, req.body?.initialize === true)
      broadcastAccount(email, { type: 'editor-tabs', workspacePath })
      res.json(snapshot)
    } catch (err) {
      handleError(res, err)
    }
  })

  router.get('/workspace', requireAuthenticated, (req, res) => {
    try {
      res.json({ state: readWorkspaceUi(authOf(req).email!, String(req.query.workspace ?? '')) })
    } catch (err) {
      handleError(res, err)
    }
  })

  router.put('/workspace', requireAuthenticated, (req, res) => {
    try {
      const workspacePath = typeof req.body?.workspacePath === 'string' ? req.body.workspacePath : ''
      res.json({ state: writeWorkspaceUi(authOf(req).email!, workspacePath, req.body?.state) })
    } catch (err) {
      handleError(res, err)
    }
  })

  return router
}
