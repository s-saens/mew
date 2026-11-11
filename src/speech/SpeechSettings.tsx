import { useEffect, useMemo, useRef, useState } from 'react'
import { SelectField } from '@mew/ui'
import { useI18n } from '../i18n'
import { fetchSpeech, installSpeech, saveSpeech, testSpeech, type SpeechConfig, type SpeechInstall, type SpeechProvider } from './api'
import { speechLabels } from './labels'

const field = 'w-full rounded border border-edge-strong bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-edge-bright'
const button = 'rounded border border-edge-strong px-2.5 py-1.5 text-sm text-ink-secondary hover:bg-surface-hover disabled:opacity-40'

export function SpeechSettings({ portalContainer }: { portalContainer: HTMLElement | null }) {
  const { locale } = useI18n()
  const s = useMemo(() => speechLabels(locale), [locale])
  const [config, setConfig] = useState<SpeechConfig | null>(null)
  const [saved, setSaved] = useState<SpeechConfig | null>(null)
  const [install, setInstall] = useState<SpeechInstall | null>(null)
  const [canInstall, setCanInstall] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [clearKey, setClearKey] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    fetchSpeech(controller.signal).then(state => {
      if (!alive.current) return
      setConfig(state.config); setSaved(state.config); setInstall(state.install); setCanInstall(state.canInstall)
    }).catch(err => { if (alive.current && !controller.signal.aborted) setError(err instanceof Error ? err.message : s.requestFailed) })
    return () => { alive.current = false; controller.abort() }
  // The first request is stable across locale changes; labels update independently.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (install?.state !== 'running') return
    const controller = new AbortController()
    const poll = () => { void fetchSpeech(controller.signal).then(state => { if (alive.current) setInstall(state.install) }).catch(err => { if (alive.current && !controller.signal.aborted) setError(err instanceof Error ? err.message : s.requestFailed) }) }
    const interval = setInterval(poll, 1500)
    return () => { clearInterval(interval); controller.abort() }
  }, [install?.state, s])
  const dirty = !!config && (!!apiKey || clearKey || JSON.stringify(config) !== JSON.stringify(saved))

  async function save() {
    if (!config) return
    setBusy(true); setError(''); setMessage('')
    try {
      const { hasApiKey: _hasApiKey, ...values } = config
      await saveSpeech({ ...values, ...(clearKey ? { apiKey: '' } : apiKey ? { apiKey } : {}) })
      const state = await fetchSpeech()
      if (!alive.current) return
      setConfig(state.config); setSaved(state.config); setInstall(state.install); setApiKey(''); setClearKey(false); setMessage(s.saved)
    } catch (err) { if (alive.current) setError(err instanceof Error ? err.message : s.requestFailed) }
    finally { if (alive.current) setBusy(false) }
  }
  async function test() {
    setBusy(true); setError(''); setMessage('')
    try { const result = await testSpeech(); if (alive.current) { if (result.ok) setMessage(result.message); else setError(result.message) } }
    catch (err) { if (alive.current) setError(err instanceof Error ? err.message : s.requestFailed) }
    finally { if (alive.current) setBusy(false) }
  }
  async function startInstall() {
    setBusy(true); setError(''); setMessage('')
    try { const result = await installSpeech(); if (alive.current) setInstall(result.install) }
    catch (err) { if (alive.current) setError(err instanceof Error ? err.message : s.requestFailed) }
    finally { if (alive.current) setBusy(false) }
  }
  if (!config) return <div role={error ? 'alert' : 'status'} className="text-sm text-ink-secondary">{error || s.loading}</div>
  return <div className="flex flex-col gap-3">
    <label className="flex flex-col gap-1 text-sm text-ink-secondary">{s.provider}<SelectField portalContainer={portalContainer} label={s.provider} value={config.provider} options={[{ value: 'faster-whisper', label: 'faster-whisper' }, { value: 'whisper-cpp', label: 'whisper.cpp' }, { value: 'openai', label: 'OpenAI-compatible' }]} onChange={value => { setApiKey(''); setClearKey(false); setConfig({ ...config, provider: value as SpeechProvider }) }} /></label>
    {(['baseUrl', 'model', 'language'] as const).filter(name => !(name === 'baseUrl' && config.provider === 'faster-whisper') && !(name === 'model' && config.provider === 'whisper-cpp')).map(name => <label key={name} className="flex flex-col gap-1 text-sm text-ink-secondary">{{ baseUrl: s.serverUrl, model: s.model, language: s.language }[name]}<input className={field} value={config[name]} placeholder={name === 'language' ? s.languageHint : name === 'baseUrl' ? config.provider === 'openai' ? 'http://localhost:8080/v1' : 'http://localhost:8080' : undefined} spellCheck={false} onChange={event => setConfig({ ...config, [name]: event.target.value })} /></label>)}
    {config.provider !== 'faster-whisper' && <><label className="flex flex-col gap-1 text-sm text-ink-secondary">{s.apiKey}<input type="password" autoComplete="new-password" className={field} value={apiKey} placeholder={s.keepKey} disabled={clearKey} onChange={event => setApiKey(event.target.value)} /></label><div className="text-xs text-ink-muted">{config.hasApiKey ? s.keySaved : s.keyMissing}</div>{config.hasApiKey && <label className="flex items-center gap-2 text-sm text-ink-secondary"><input type="checkbox" checked={clearKey} onChange={event => { setClearKey(event.target.checked); if (event.target.checked) setApiKey('') }} />{s.clearKey}</label>}</>}
    {config.provider === 'faster-whisper' && <><label className="flex items-start gap-2 text-sm text-ink-secondary"><input className="mt-1" type="checkbox" checked={config.allowModelDownload} onChange={event => setConfig({ ...config, allowModelDownload: event.target.checked })} />{s.downloadConsent}</label><a className="text-xs text-accent underline" href={config.model === 'turbo' || config.model === 'large-v3-turbo' ? 'https://huggingface.co/mobiuslabsgmbh/faster-whisper-large-v3-turbo' : `https://huggingface.co/Systran/faster-whisper-${encodeURIComponent(config.model)}`} target="_blank" rel="noreferrer">{s.sourceModel}</a></>}
    <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !dirty} onClick={() => void save()} className="rounded bg-accent px-3 py-1.5 text-sm text-ink-on-accent disabled:opacity-40">{s.save}</button><button type="button" disabled={busy || dirty} onClick={() => void test()} className={button}>{s.test}</button></div>
    <div className="text-xs text-ink-muted">{s.testNotice}</div>
    {canInstall && <div className="flex flex-col gap-2 border-t border-edge pt-3"><div className="text-sm font-medium text-ink">{s.installTitle}</div><p className="text-xs text-ink-secondary">{s.installNotice}</p><div className="flex flex-wrap items-center gap-2"><button type="button" disabled={busy || install?.state === 'running'} onClick={() => void startInstall()} className={button}>{s.install}</button><span role="status" className="text-xs text-ink-muted">{install?.state === 'running' ? s.loading : install?.state === 'failed' ? s.installFailed : install?.installed ? s.installed : ''}</span></div><a className="text-xs text-accent underline" href="https://github.com/SYSTRAN/faster-whisper/blob/master/LICENSE" target="_blank" rel="noreferrer">{s.sourceRuntime}</a>{install?.output && <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-surface p-2 text-xs text-ink-secondary">{install.output}</pre>}</div>}
    {message && <div role="status" className="text-sm text-ink">{message}</div>}{error && <div role="alert" className="select-text text-sm text-danger">{error}</div>}
  </div>
}
