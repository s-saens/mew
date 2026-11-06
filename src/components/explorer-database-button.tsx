import { Database } from 'iconoir-react'
import { HoverTipLayer } from '@mew/ui'
import { useI18n } from '../i18n'

export function ExplorerDatabaseButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n()
  return <HoverTipLayer className="contents">
    <button type="button" data-explorer-database onClick={onOpen}
      aria-label={t('header.database')} data-tip={t('header.database')} aria-haspopup="dialog"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-secondary hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
      <Database width={16} height={16} aria-hidden="true" />
    </button>
  </HoverTipLayer>
}
