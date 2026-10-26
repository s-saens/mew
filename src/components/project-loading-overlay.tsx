import { LoadingIndicator } from '@mew/ui'
import { useI18n } from '../i18n'

export function ProjectLoadingOverlay() {
  const { t } = useI18n()
  return <div role="status" aria-label={t('common.loading')}
    className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
    <LoadingIndicator size={56} className="text-ink" />
    <span className="sr-only">{t('common.loading')}</span>
  </div>
}
