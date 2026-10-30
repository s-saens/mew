import { useId } from 'react'
import { normalizeIconPack, type IconPackId } from '../../shared/icon-packs'
import { ICON_PACKS } from '../utils/icon-pack-catalog'
import { useI18n } from '../i18n'
import { IconPackProvider } from './icon-pack-context'
import { FileTypeIcon, FolderTypeIcon } from './file-type-icon'

export function IconPackSettings({ value, onChange }: { value?: IconPackId; onChange: (value: IconPackId) => void }) {
  const { t } = useI18n()
  const id = useId(), selected = normalizeIconPack(value)
  const current = ICON_PACKS.find(pack => pack.id === selected)!
  const linkClass = 'rounded text-ink-secondary underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent'
  return <fieldset className="mt-3 min-w-0 border-t border-edge pt-3">
    <legend className="float-left mb-1 w-full text-sm font-medium">{t('settings.fileIcons')}</legend>
    <div className="clear-both" role="radiogroup" aria-label={t('settings.fileIcons')}>
      {ICON_PACKS.map(pack => <label key={pack.id} className="flex min-h-8 cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-surface-raised focus-within:outline-2 focus-within:outline-accent pointer-coarse:min-h-11">
        <input type="radio" name={id} value={pack.id} checked={selected === pack.id} onChange={() => onChange(pack.id)}
          className="h-4 w-4 shrink-0 accent-accent" />
        <span className="min-w-0 flex-1 text-sm">{pack.name ?? t('settings.basicIcons')}</span>
        <span aria-hidden="true" className="flex shrink-0 items-center gap-2">
          <IconPackProvider value={pack.id}>
            <FolderTypeIcon /><FileTypeIcon name="note.md" /><FileTypeIcon name="main.ts" /><FileTypeIcon name="package.json" />
          </IconPackProvider>
        </span>
      </label>)}
    </div>
    {current.source && current.license && <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-xs">
      <a className={linkClass} href={current.source} target="_blank" rel="noopener noreferrer">{t('settings.iconSource')}</a>
      <a className={linkClass} href={current.license} target="_blank" rel="noopener noreferrer">{t('settings.iconLicense')}</a>
      {current.notices && <a className={linkClass} href={current.notices} target="_blank" rel="noopener noreferrer">{t('settings.iconNotices')}</a>}
    </div>}
  </fieldset>
}
