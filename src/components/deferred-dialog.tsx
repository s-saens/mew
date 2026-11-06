import { useEffect, useId, useState, type ComponentType } from 'react'
import { DialogFrame, HoverTipLayer, LoadingIndicator } from '@mew/ui'
import { uiText } from '@mew/ui/i18n-core'
import { useI18n } from '../i18n'
import { PanelCloseButton } from './panel-close-button'

type DialogOptions = {
  title: (t: ReturnType<typeof useI18n>['t']) => string
  size?: 'default' | 'settings'
  className?: string
  overlayClassName?: string
}

/** Commit a dismissible shell before downloading optional dialog code. */
export function deferredDialog<Props extends { onClose: () => void }>(load: () => Promise<{ default: ComponentType<Props> }>, options: DialogOptions) {
  let prepared: ComponentType<Props> | undefined
  let pending: Promise<ComponentType<Props>> | undefined
  const prepare = () => pending ??= Promise.resolve().then(load).then(module => {
    prepared = module.default
    return prepared
  }, error => { pending = undefined; throw error })

  return function DeferredDialog(props: Props) {
    const { t } = useI18n()
    const titleId = useId()
    const [Component, setComponent] = useState(() => prepared)
    const [failed, setFailed] = useState(false)
    const [attempt, setAttempt] = useState(0)
    useEffect(() => {
      let active = true
      void prepare().then(component => { if (active) setComponent(() => component) }, () => { if (active) setFailed(true) })
      return () => { active = false }
    }, [attempt])

    if (Component) return <Component {...props} />
    return <DialogFrame labelledBy={titleId} onClose={props.onClose} size={options.size}
      className={options.className ?? 'flex max-h-[90dvh] max-w-md flex-col'} overlayClassName={options.overlayClassName}>
      <HoverTipLayer className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-edge px-3 py-2">
          <h2 id={titleId} className="text-sm font-semibold text-ink-bright">{options.title(t)}</h2>
          <PanelCloseButton aria-label={t('common.close')} onClick={props.onClose} data-dialog-autofocus />
        </header>
        {failed ? <div role="alert" className="flex flex-col items-start gap-2 p-3 text-sm text-ink">
          <p>{uiText('불러오기 실패')}</p>
          <button type="button" className="rounded border border-edge px-2 py-1 text-xs hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() => { setFailed(false); setAttempt(value => value + 1) }}>{uiText('다시 시도')}</button>
        </div> : <div role="status" aria-label={t('common.loading')} aria-busy="true" className="flex min-h-24 flex-1 items-center justify-center text-ink-secondary">
          <LoadingIndicator size={20} />
        </div>}
      </HoverTipLayer>
    </DialogFrame>
  }
}
