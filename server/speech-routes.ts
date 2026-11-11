import express from 'express'
import multer from 'multer'
import { canUse } from './access-policy.ts'
import { authOf } from './reqAuth.ts'
import { installSpeechRuntime, speechInstallStatus } from './speech-install.ts'
import { MAX_SPEECH_AUDIO_BYTES, testSpeechConnection, transcribeSpeech } from './speech-engine.ts'
import { publicSpeechConfig, readSpeechConfig, requireSpeechRevision, speechConfigRevision, SpeechError, writeSpeechConfig } from './speech-settings.ts'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_SPEECH_AUDIO_BYTES, files: 1, fields: 1, fieldSize: 128 } })
let activeTranscriptions = 0
const MAX_ACTIVE_TRANSCRIPTIONS = 2

export function createSpeechRouter(transcribe: typeof transcribeSpeech = transcribeSpeech) {
  const router = express.Router()
  router.use((req, res, next) => {
    const auth = authOf(req)
    res.setHeader('Cache-Control', 'no-store')
    if (!auth.email || !['owner', 'manager'].includes(auth.role) || !canUse(auth, 'terminal')) { res.status(403).json({ error: 'Permission denied' }); return }
    next()
  })
  router.get('/', (req, res) => {
    const config = readSpeechConfig(authOf(req).email!)
    res.json({ config: publicSpeechConfig(config), revision: speechConfigRevision(config), canManage: true, canInstall: authOf(req).role === 'owner', install: speechInstallStatus() })
  })
  router.put('/config', (req, res, next) => {
    try { res.json({ config: writeSpeechConfig(authOf(req).email!, req.body) }) } catch (error) { next(error) }
  })
  router.post('/test', async (req, res, next) => {
    try { res.json(await testSpeechConnection(readSpeechConfig(authOf(req).email!))) } catch (error) { next(error) }
  })
  router.post('/install', (req, res, next) => {
    if (authOf(req).role !== 'owner') { res.status(403).json({ error: 'Only the owner can install the runtime' }); return }
    try { res.json({ install: installSpeechRuntime() }) } catch (error) { next(error) }
  })
  router.post('/transcribe', (_req, res, next) => {
    if (activeTranscriptions >= MAX_ACTIVE_TRANSCRIPTIONS) { res.status(429).json({ error: 'Too many speech requests' }); return }
    activeTranscriptions++
    let released = false, processing = false
    const release = () => { if (!released) { released = true; activeTranscriptions-- } }
    res.locals.speechLease = { release, start: () => { processing = true } }
    res.once('close', () => { if (!processing) release() })
    next()
  }, upload.single('audio'), async (req, res, next) => {
    const lease = res.locals.speechLease as { release: () => void; start: () => void }
    lease.start()
    const controller = new AbortController()
    const abort = () => { if (!res.writableEnded) controller.abort() }
    res.once('close', abort)
    try {
      if (!req.file) throw new SpeechError('Audio is required')
      const config = readSpeechConfig(authOf(req).email!)
      requireSpeechRevision(config, req.body?.revision)
      const text = await transcribe(config, req.file.buffer, controller.signal)
      if (!res.destroyed) res.json({ text })
    } catch (error) { if (!res.destroyed) next(error) }
    finally { res.off('close', abort); lease.release() }
  })
  router.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof SpeechError) res.status(error.status).json({ error: error.message })
    else if (error instanceof multer.MulterError) res.status(400).json({ error: 'Invalid or oversized audio upload' })
    else res.status(500).json({ error: 'Speech request failed' })
  })
  return router
}
