import { useId, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { Check, FloppyDisk, Plus, Trash } from 'iconoir-react'
import { ColorPicker, useOverlayDismiss } from '@mew/ui'
import { useI18n } from '../i18n'
import { ThemeGradientAngle } from './theme-gradient-angle'
import { DEFAULT_THEME_PALETTE, deriveThemePalette, normalizeThemeSettings, sameThemePalette, themeBackgroundImage, themePaletteContrast, THEME_PRESETS, type ThemeGradient, type ThemePalette, type ThemeSettings } from '../utils/theme-color'

function sampleStyle(palette: ThemePalette): CSSProperties {
  return {
    backgroundColor: palette.background,
    color: palette.text,
    '--theme-background-image': themeBackgroundImage(palette),
    '--theme-background-animation': palette.gradient?.animated ? 'theme-background-drift 18s ease-in-out infinite alternate' : 'none',
  } as CSSProperties
}

function initialGradient(palette: ThemePalette): ThemeGradient {
  return palette.gradient ?? { colors: [palette.background, deriveThemePalette(palette)['surface-raised']], angle: 135, animated: true }
}

function ThemeSample({ palette }: { palette: ThemePalette }) {
  return <span aria-hidden="true" className="text-2xl font-medium leading-none">
    <span style={{ color: palette.text }}>A</span><span style={{ color: palette.primary }}>a</span>
  </span>
}

export function ThemeButton({ palette, label, selected, onSelect }: { palette: ThemePalette; label: string; selected: boolean; onSelect: (event: MouseEvent<HTMLButtonElement>) => void }) {
  return <button type="button" aria-label={label} aria-pressed={selected} data-tip={label} onClick={onSelect}
    style={sampleStyle(palette)}
    className={`theme-background-sample relative flex h-18 min-w-0 flex-col items-center justify-center gap-2 rounded-lg border px-1 hover:border-ink-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${selected ? 'border-ink ring-1 ring-ink' : 'border-edge-strong'}`}>
    <ThemeSample palette={palette} />
    <span className="max-w-full truncate text-xs leading-none">{label}</span>
    {selected && <Check width={12} height={12} aria-hidden="true" className="absolute right-1 top-1" />}
  </button>
}

export function ThemeSettingsPanel({ value, onChange }: { value: ThemeSettings; onChange: (value: ThemeSettings) => void }) {
  const { t } = useI18n()
  const id = useId(), addButton = useRef<HTMLButtonElement>(null)
  const [draft, setDraft] = useState<ThemePalette | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const draftStart = useRef(value.palette), gradientBackup = useRef<ThemeGradient | null>(null)
  const editButton = useRef<HTMLButtonElement | null>(null)
  const close = () => { setDraft(null); (editButton.current ?? addButton.current)?.focus({ preventScroll: true }) }
  useOverlayDismiss(draft !== null && close)
  const iconButton = 'flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent max-md:h-11 max-md:w-11'

  function edit(palette: ThemePalette, index: number | null, trigger: HTMLButtonElement) {
    editButton.current = trigger
    draftStart.current = palette
    gradientBackup.current = initialGradient(palette)
    setEditingIndex(index)
    setDraft(palette)
  }

  function select(palette: ThemePalette) {
    setDraft(null)
    onChange({ ...value, palette })
  }

  function save() {
    if (!draft) return
    const custom = editingIndex === null ? [...value.custom, draft] : value.custom.map((palette, index) => index === editingIndex ? draft : palette)
    onChange(normalizeThemeSettings({ palette: draft, custom }))
    close()
  }

  function colorField(color: 'background' | 'text' | 'primary') {
    if (!draft) return null
    return <ColorPicker compact value={draft[color]} defaultValue={draftStart.current[color]}
      onChange={next => setDraft({ ...draft, [color]: next })}
      labels={{ color: t(`settings.theme.${color}`), hex: t(`settings.theme.${color}Hex`),
        hue: t('settings.colorHue'), saturation: t('settings.colorSaturation'), brightness: t('settings.colorBrightness'), reset: t('common.reset'), close: t('common.close') }} />
  }

  return <div>
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="text-sm font-medium">{t('settings.theme')}</div>
    </div>
    <div role="group" aria-label={t('settings.theme')} className="grid grid-cols-3 gap-2 min-[360px]:grid-cols-4">
      {THEME_PRESETS.map(preset => <ThemeButton key={preset.id} palette={preset.palette} label={t(`settings.themePreset.${preset.id}`)}
        selected={sameThemePalette(value.palette, preset.palette)} onSelect={() => select(preset.palette)} />)}
      {value.custom.map((palette, index) => <ThemeButton key={JSON.stringify(palette)} palette={palette}
        label={t('settings.customThemeNumber', { number: index + 1 })} selected={sameThemePalette(value.palette, palette)} onSelect={event => { select(palette); edit(palette, index, event.currentTarget) }} />)}
      <button ref={addButton} type="button" aria-label={t('settings.customizeTheme')} data-tip={t('settings.customizeTheme')} aria-expanded={draft !== null && editingIndex === null} aria-controls={draft ? id : undefined}
        className="flex h-18 items-center justify-center rounded-lg border border-dashed border-edge-bright text-ink-secondary hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        onClick={event => edit(value.palette, null, event.currentTarget)}><Plus width={24} height={24} aria-hidden="true" /></button>
    </div>
    {draft && <div id={id} role="group" aria-label={t('settings.customTheme')} className="mt-3 border-t border-edge pt-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="theme-background-sample relative flex h-11 w-16 items-center justify-center rounded-lg border border-edge-strong" style={sampleStyle(draft)}><ThemeSample palette={draft} /></span>
          <span className="text-sm font-medium">{t('settings.customTheme')}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={save} className={`${iconButton} text-accent hover:text-accent-strong`}
            aria-label={t(editingIndex === null ? 'settings.addTheme' : 'settings.saveTheme')} data-tip={t(editingIndex === null ? 'settings.addTheme' : 'settings.saveTheme')}>
            <FloppyDisk width={18} height={18} aria-hidden="true" />
          </button>
          {editingIndex !== null && <button type="button" onClick={() => {
            onChange({ palette: DEFAULT_THEME_PALETTE, custom: value.custom.filter((_, index) => index !== editingIndex) })
            editButton.current = null
            close()
          }} className={`${iconButton} text-danger-ink`} aria-label={t('settings.removeTheme')} data-tip={t('settings.removeTheme')}>
            <Trash width={18} height={18} aria-hidden="true" />
          </button>}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {colorField('background')}
          <div className="flex items-center gap-1">
            <label className="flex min-h-8 pointer-coarse:min-h-11 cursor-pointer items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={!!draft.gradient} className="h-4 w-4 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                onChange={event => {
                  if (event.target.checked) setDraft({ ...draft, gradient: gradientBackup.current ?? initialGradient(draft) })
                  else { gradientBackup.current = draft.gradient ?? null; setDraft({ ...draft, gradient: undefined }) }
                }} />
              {t('settings.theme.gradient')}
            </label>
            {draft.gradient && ([0, 1] as const).map(index => <ColorPicker compact swatchOnly key={index} value={draft.gradient!.colors[index]} defaultValue={initialGradient(draftStart.current).colors[index]}
                onChange={next => {
                  const colors: [string, string] = [...draft.gradient!.colors]
                  colors[index] = next
                  setDraft({ ...draft, gradient: { ...draft.gradient!, colors } })
                }}
                labels={{ color: t('settings.theme.gradientColor', { number: index + 1 }), hex: t('settings.theme.gradientColorHex', { number: index + 1 }),
                  hue: t('settings.colorHue'), saturation: t('settings.colorSaturation'), brightness: t('settings.colorBrightness'), reset: t('common.reset'), close: t('common.close') }} />)}
          </div>
          <div className="flex items-center gap-2">
            {colorField('text')}
            {colorField('primary')}
          </div>
        </div>
        {draft.gradient && <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <ThemeGradientAngle value={draft.gradient.angle} label={t('settings.theme.gradientAngle')}
            onChange={angle => setDraft({ ...draft, gradient: { ...draft.gradient!, angle } })} />
          <label className="flex min-h-8 pointer-coarse:min-h-11 cursor-pointer items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={draft.gradient.animated} className="h-4 w-4 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              onChange={event => setDraft({ ...draft, gradient: { ...draft.gradient!, animated: event.target.checked } })} />
            {t('settings.theme.gradientAnimated')}
          </label>
        </div>}
      </div>
      {themePaletteContrast(draft) < 4.5 && <p role="status" className="mt-2 text-xs text-warning-ink">{t('settings.themeLowContrast')}</p>}
    </div>}
  </div>
}
