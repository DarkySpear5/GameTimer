import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../common/Modal'
import { EyedropperButton } from '../common/EyedropperButton'
import { useProfilesStore } from '../../state/profilesStore'
import { toast } from '../common/Toast'
import { GENRE_OPTIONS } from '@shared/constants'
import { formatSeconds } from '@shared/format'
import type { Profile, Status } from '@shared/types'

type Tab = 'general' | 'time' | 'appearance' | 'genres'

export function ModifyDialog({ name, onClose }: { name: string; onClose: () => void }): React.JSX.Element | null {
  const { t } = useTranslation()
  const profile = useProfilesStore((s) => s.profiles[name])
  const [tab, setTab] = useState<Tab>('general')

  if (!profile) return null

  const TABS: { id: Tab; label: string }[] = [
    { id: 'general', label: t('tab_modify_general') },
    { id: 'time', label: t('tab_modify_time') },
    { id: 'appearance', label: t('tab_modify_appearance') },
    { id: 'genres', label: t('tab_modify_genres') }
  ]

  return (
    <Modal title={t('dlg_modify_title', { name: profile.name })} onClose={onClose} width="max-w-lg">
      <div className="mb-4 flex gap-1 border-b border-card">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              tab === tb.id ? 'border-b-2 border-accent text-accent' : 'text-subtext hover:text-text'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>
      {tab === 'general' && <GeneralTab profile={profile} onClose={onClose} />}
      {tab === 'time' && <TimeTab profile={profile} />}
      {tab === 'appearance' && <AppearanceTab profile={profile} />}
      {tab === 'genres' && <GenresTab profile={profile} />}
    </Modal>
  )
}

function GeneralTab({ profile, onClose }: { profile: Profile; onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation()
  const [newName, setNewName] = useState(profile.name)

  const STATUS_OPTIONS: { value: Status; label: string }[] = [
    { value: 'in_progress', label: t('status_in_progress') },
    { value: 'completed', label: t('status_completed') },
    { value: 'dropped', label: t('status_dropped') },
    { value: 'on_hold', label: t('status_on_hold') }
  ]

  async function handleRename(): Promise<void> {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === profile.name) return
    try {
      const renamed = await window.api.profiles.rename(profile.name, trimmed)
      useProfilesStore.getState().rename(profile.name, renamed)
      onClose() // matches v1: renaming the selected profile closes Modify since the old key is now stale
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function setStatus(status: Status): Promise<void> {
    useProfilesStore.getState().upsert(await window.api.profiles.setStatus(profile.name, status))
  }

  async function setRating(rating: 0 | 1 | 2 | 3 | 4 | 5): Promise<void> {
    useProfilesStore.getState().upsert(await window.api.profiles.setRating(profile.name, rating))
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className="mb-1 block text-xs text-subtext">{t('dlg_rename_prompt')}</label>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleRename()}
            className="flex-1 rounded bg-card px-2.5 py-1.5 text-sm text-text outline-none ring-1 ring-transparent focus:ring-accent"
          />
          <button
            onClick={() => void handleRename()}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-bg hover:opacity-90"
          >
            {t('ctx_rename')}
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-subtext">{t('label_status')}</label>
        <div className="grid grid-cols-2 gap-1.5">
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => void setStatus(o.value)}
              className={`rounded px-3 py-1.5 text-sm transition-colors ${
                profile.status === o.value ? 'bg-accent text-bg' : 'bg-card text-text hover:bg-card/70'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {profile.status !== 'in_progress' && profile.statusAt && (
          <div className="mt-1.5 text-xs text-subtext">
            {profile.statusSeconds != null
              ? t('label_status_snapshot', {
                  date: profile.statusAt,
                  time: formatSeconds(profile.statusSeconds)
                })
              : profile.statusAt}
          </div>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs text-subtext">{t('label_rating')}</label>
        <div className="flex gap-1 text-2xl">
          {([1, 2, 3, 4, 5] as const).map((n) => (
            <button
              key={n}
              onClick={() => void setRating(profile.rating === n ? 0 : n)}
              className={n <= profile.rating ? 'text-gold' : 'text-card'}
            >
              ★
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function TimeTab({ profile }: { profile: Profile }): React.JSX.Element {
  const { t } = useTranslation()
  const [direction, setDirection] = useState<'add' | 'remove'>('add')
  const [hours, setHours] = useState('0')
  const [minutes, setMinutes] = useState('0')
  const [note, setNote] = useState('')

  async function apply(): Promise<void> {
    const h = parseInt(hours, 10) || 0
    const m = parseInt(minutes, 10) || 0
    const deltaSeconds = h * 3600 + m * 60
    if (deltaSeconds <= 0) {
      toast.error(t('err_add_time_empty'))
      return
    }
    const signed = direction === 'remove' ? -deltaSeconds : deltaSeconds
    const updated = await window.api.profiles.addRemoveTime(profile.name, signed, note.trim() || undefined)
    useProfilesStore.getState().upsert(updated)
    setHours('0')
    setMinutes('0')
    setNote('')
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5">
        <button
          onClick={() => setDirection('add')}
          className={`flex-1 rounded px-3 py-1.5 text-sm ${direction === 'add' ? 'bg-accent text-bg' : 'bg-card text-text'}`}
        >
          {t('label_add')}
        </button>
        <button
          onClick={() => setDirection('remove')}
          className={`flex-1 rounded px-3 py-1.5 text-sm ${direction === 'remove' ? 'bg-accent text-bg' : 'bg-card text-text'}`}
        >
          {t('label_remove')}
        </button>
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-subtext">{t('label_hours')}</label>
          <input
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="w-full rounded bg-card px-2.5 py-1.5 text-sm text-text outline-none"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs text-subtext">{t('label_minutes')}</label>
          <input
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="w-full rounded bg-card px-2.5 py-1.5 text-sm text-text outline-none"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs text-subtext">{t('label_note_optional')}</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('hint_note_example')}
          className="w-full rounded bg-card px-2.5 py-1.5 text-sm text-text outline-none"
        />
      </div>
      <button
        onClick={() => void apply()}
        className="self-start rounded bg-accent px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90"
      >
        {t('btn_save')}
      </button>
    </div>
  )
}

function AppearanceTab({ profile }: { profile: Profile }): React.JSX.Element {
  const { t } = useTranslation()
  const [localBgColor, setLocalBgColor] = useState(profile.bgColor ?? '#26263a')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function chooseIcon(): Promise<void> {
    const updated = await window.api.profiles.setIcon(profile.name)
    if (updated) useProfilesStore.getState().upsert(updated)
  }
  async function chooseBackgroundImage(): Promise<void> {
    const updated = await window.api.profiles.setBackground(profile.name, 'image', '')
    if (updated) useProfilesStore.getState().upsert(updated)
  }
  function chooseBackgroundColor(color: string): void {
    // The OS color picker's drag surface fires onChange many times per
    // second — update the swatch instantly, but only commit (and hit disk)
    // once movement pauses, same reasoning as Settings' font-scale slider.
    setLocalBgColor(color)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void window.api.profiles.setBackground(profile.name, 'color', color).then((updated) => {
        if (updated) useProfilesStore.getState().upsert(updated)
      })
    }, 250)
  }
  async function resetBackground(): Promise<void> {
    const updated = await window.api.profiles.clearBackground(profile.name)
    setLocalBgColor(updated.bgColor ?? '#26263a')
    useProfilesStore.getState().upsert(updated)
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className="mb-1 block text-xs text-subtext">{t('label_icon')}</label>
        <div className="flex items-center gap-3">
          {profile.iconFile ? (
            <img
              src={`gt-asset://icons/${encodeURIComponent(profile.iconFile)}`}
              className="h-10 w-10 rounded object-cover"
            />
          ) : (
            <div className="h-10 w-10 rounded bg-card" />
          )}
          <button
            onClick={() => void chooseIcon()}
            className="rounded bg-card px-3 py-1.5 text-sm text-text hover:bg-card/70"
          >
            {t('ctx_change_icon')}
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-subtext">{t('label_background')}</label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="color"
            title={t('dlg_choose_bg_color_title')}
            value={localBgColor}
            onChange={(e) => chooseBackgroundColor(e.target.value)}
            className="h-8 w-10 cursor-pointer rounded bg-card"
          />
          <EyedropperButton onPick={chooseBackgroundColor} />
          <button
            onClick={() => void chooseBackgroundImage()}
            className="rounded bg-card px-3 py-1.5 text-sm text-text hover:bg-card/70"
          >
            {t('btn_choose_image')}
          </button>
          <button
            onClick={() => void resetBackground()}
            className="rounded bg-card px-3 py-1.5 text-sm text-text hover:bg-card/70"
          >
            {t('btn_reset_default')}
          </button>
        </div>
      </div>
    </div>
  )
}

function GenresTab({ profile }: { profile: Profile }): React.JSX.Element {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<Set<string>>(new Set(profile.genres))

  function toggle(genre: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(genre)) next.delete(genre)
      else next.add(genre)
      return next
    })
  }

  async function apply(): Promise<void> {
    const genres = selected.size ? [...selected] : ['Uncategorized']
    useProfilesStore.getState().upsert(await window.api.profiles.setGenres(profile.name, genres))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid max-h-64 grid-cols-2 gap-1 overflow-y-auto">
        {GENRE_OPTIONS.map((g) => (
          <label key={g} className="flex items-center gap-2 rounded px-2 py-1 text-sm text-text hover:bg-card">
            <input type="checkbox" checked={selected.has(g)} onChange={() => toggle(g)} />
            {t(g, { ns: 'genres' })}
          </label>
        ))}
      </div>
      <button
        onClick={() => void apply()}
        className="self-start rounded bg-accent px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90"
      >
        {t('btn_assign')}
      </button>
    </div>
  )
}
