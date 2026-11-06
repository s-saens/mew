import { Hammer, Rocket } from 'iconoir-react'
import { HoverTipLayer, keepFocusOnPress, useToast } from '@mew/ui'
import { useI18n } from '../i18n'
import type { AgentExecutionOptions } from '../../shared/agent-execution-options'

const copy = {
  ko: { build: '빌드', deploy: '배포' },
  en: { build: 'Build', deploy: 'Deploy' },
  ja: { build: 'ビルド', deploy: 'デプロイ' },
  'zh-CN': { build: '构建', deploy: '部署' },
}

export function AgentExecutionToggles({ value, onChange, disabled = false }: {
  value: AgentExecutionOptions
  onChange: (value: AgentExecutionOptions) => void
  disabled?: boolean
}) {
  const { locale } = useI18n()
  const { toast, showToast } = useToast()
  return <>
    <HoverTipLayer className="flex items-stretch gap-1">
      {(['build', 'deploy'] as const).map(key => {
        const Icon = key === 'build' ? Hammer : Rocket
        const label = copy[locale][key]
        return <div key={key} data-tip={`${label} ${value[key] ? 'on' : 'off'}`} className="flex min-h-8 items-center">
          <button type="button" aria-label={label} aria-pressed={value[key]} disabled={disabled}
            onPointerDown={keepFocusOnPress}
            onClick={() => {
              const next = !value[key]
              onChange({ ...value, [key]: next })
              showToast(`${label} ${next ? 'on' : 'off'}`)
            }}
            className={`flex h-7 w-7 items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40 ${value[key] ? 'bg-accent/15 text-accent hover:bg-accent/25' : 'bg-surface text-ink-muted hover:bg-surface-raised hover:text-ink'}`}>
            <Icon width={17} height={17} aria-hidden="true" />
          </button>
        </div>
      })}
    </HoverTipLayer>
    {toast}
  </>
}
