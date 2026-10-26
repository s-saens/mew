import { useEffect, useRef, useState, type FormEvent } from 'react'
import { EditPencil, MediaImage, PasteClipboard, User } from 'iconoir-react'
import { ActionMenu, ActionMenuItem } from '@mew/ui'
import { uiText } from '@mew/ui/i18n-core'
import { useUiLocale } from '@mew/ui/i18n'
import { updateProfile } from '../api/client'
import { useI18n } from '../i18n'

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export function AccountProfileForm({ email, displayName, avatarDataUrl, hasPassword = true, onProfileChanged }: {
  email: string
  displayName: string | null
  avatarDataUrl: string | null
  hasPassword?: boolean
  onProfileChanged: (profile: { displayName: string; avatarDataUrl: string | null }) => void
}) {
  useUiLocale()
  const { t } = useI18n()
  const [name, setName] = useState(displayName ?? email.split('@')[0] ?? email)
  const [avatar, setAvatar] = useState(avatarDataUrl)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reading, setReading] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; trigger: HTMLButtonElement } | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const photoRequest = useRef(0)
  const disabled = saving || reading

  useEffect(() => () => { photoRequest.current++ }, [])

  async function loadPhoto(load: () => Blob | Promise<Blob>) {
    const request = ++photoRequest.current
    setReading(true)
    setError(null)
    setSaved(false)
    try {
      const file = await load()
      if (request !== photoRequest.current) return
      if (!PHOTO_TYPES.includes(file.type) || file.size > 512 * 1024) {
        throw new Error(uiText('프로필 사진은 512KB 이하의 JPG, PNG, WebP 또는 GIF만 사용할 수 있습니다'))
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error(uiText('사진을 읽지 못했습니다')))
        reader.onerror = () => reject(new Error(uiText('사진을 읽지 못했습니다')))
        reader.readAsDataURL(file)
      })
      if (request === photoRequest.current) setAvatar(dataUrl)
    } catch (err) {
      if (request === photoRequest.current) setError(err instanceof Error ? err.message : uiText('사진을 읽지 못했습니다'))
    } finally {
      if (request === photoRequest.current) setReading(false)
    }
  }

  async function clipboardPhoto(): Promise<Blob> {
    const readError = uiText('클립보드에서 사진을 읽지 못했습니다. 브라우저 권한을 확인하거나 사진을 선택하세요.')
    let items: ClipboardItem[]
    try {
      if (!navigator.clipboard?.read) throw new Error(readError)
      items = await navigator.clipboard.read()
    } catch {
      throw new Error(readError)
    }
    const item = items.find(item => item.types.some(type => PHOTO_TYPES.includes(type)))
      ?? items.find(item => item.types.some(type => type.startsWith('image/')))
    const type = item?.types.find(type => PHOTO_TYPES.includes(type)) ?? item?.types.find(type => type.startsWith('image/'))
    if (!item || !type) throw new Error(uiText('클립보드에 사진이 없습니다. 사진을 복사하거나 파일을 선택하세요.'))
    try { return await item.getType(type) }
    catch { throw new Error(readError) }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    if (disabled || !name.trim()) return
    setError(null)
    setSaved(false)
    setSaving(true)
    try {
      const result = await updateProfile(name, avatar)
      setName(result.profile.displayName)
      setAvatar(result.profile.avatarDataUrl)
      onProfileChanged(result.profile)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : uiText('프로필 저장에 실패했습니다'))
    } finally {
      setSaving(false)
    }
  }

  return <form onSubmit={saveProfile} className="mb-4 flex flex-col gap-2">
    <div className="flex items-center gap-3">
      <button type="button" aria-label={uiText('프로필 사진 변경')} data-tip={uiText('프로필 사진 변경')}
        aria-haspopup="menu" aria-expanded={!!menu} disabled={disabled}
        onClick={event => {
          const rect = event.currentTarget.getBoundingClientRect()
          setMenu({ x: rect.left, y: rect.bottom + 4, trigger: event.currentTarget })
        }}
        onKeyDown={event => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          const rect = event.currentTarget.getBoundingClientRect()
          setMenu({ x: rect.left, y: rect.bottom + 4, trigger: event.currentTarget })
        }}
        className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-edge-strong bg-surface-raised text-xl font-semibold text-ink-secondary outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">
        {avatar
          ? <img src={avatar} alt={uiText('프로필 사진 미리보기')} className="h-full w-full object-cover" />
          : <span aria-hidden="true">{(name.trim()[0] ?? email[0] ?? '?').toUpperCase()}</span>}
        <span aria-hidden="true" className={`absolute inset-0 flex items-center justify-center bg-black/60 text-white group-hover:opacity-100 group-focus-visible:opacity-100 ${menu ? 'opacity-100' : 'opacity-0'}`}>
          <EditPencil width={22} height={22} />
        </span>
      </button>
      <input ref={photoInput} type="file" accept={PHOTO_TYPES.join(',')} hidden disabled={disabled}
        onChange={event => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) void loadPhoto(() => file)
        }} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ink-bright">{t('settings.myAccount')}</div>
        <div className="truncate text-sm text-ink-secondary">{hasPassword ? email : displayName ?? uiText('Mewlink 계정')}</div>
        <div className="mt-1.5 flex items-center gap-2">
          <input aria-label={uiText('표시 이름')} placeholder={uiText('표시 이름')} value={name} disabled={saving}
            onChange={event => { setName(event.target.value); setSaved(false) }} maxLength={50} required
            className="min-w-0 w-full rounded border border-edge-strong bg-surface px-2 py-1.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-edge-bright disabled:opacity-40" />
          <button type="submit" disabled={disabled || !name.trim()} className="shrink-0 rounded bg-accent px-3 py-1.5 text-sm font-medium text-ink-on-accent hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40">
            {saving ? uiText('저장 중…') : uiText('저장')}
          </button>
        </div>
      </div>
    </div>
    {error && <div role="alert" className="select-text text-sm text-danger">{error}</div>}
    {saved && <div role="status" className="text-sm text-success">{uiText('프로필을 저장했습니다')}</div>}
    {menu && <ActionMenu x={menu.x} y={menu.y} label={uiText('프로필 사진 변경')} trigger={menu.trigger} onClose={() => setMenu(null)}>
      <ActionMenuItem icon={<User />} onClick={() => { photoRequest.current++; setAvatar(null); setError(null); setSaved(false) }}>{uiText('기본')}</ActionMenuItem>
      <ActionMenuItem icon={<MediaImage />} onClick={() => photoInput.current?.click()}>{uiText('사진 선택')}</ActionMenuItem>
      <ActionMenuItem icon={<PasteClipboard />} onClick={() => void loadPhoto(clipboardPhoto)}>{uiText('클립보드에서 붙여넣기')}</ActionMenuItem>
    </ActionMenu>}
  </form>
}
