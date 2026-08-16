import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../common/Modal'
import { Spinner } from '../common/Spinner'
import { useProfilesStore } from '../../state/profilesStore'
import { useSettingsStore } from '../../state/settingsStore'
import { toast } from '../common/Toast'
import { RunningAppPicker } from './RunningAppPicker'

/** Last path segment, for showing which executable a game is linked to. */
function basename(fullPath: string): string {
  return fullPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? fullPath
}
import { GENRE_OPTIONS } from '@shared/constants'
import { formatSeconds } from '@shared/format'
import type { ArtOptions, Profile, Status } from '@shared/types'

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
  const [linking, setLinking] = useState(false)
  const [busy, setBusy] = useState(false)

  /**
   * Attaching an .exe to a game that was added by hand. Without this the only
   * way to make an existing game detectable was to delete and re-add it, which
   * would throw away its playtime, sessions and completion record.
   */
  async function link(exePath: string, windowTitle: string): Promise<void> {
    setBusy(true)
    try {
      const identity = await window.api.detect.identify(exePath, windowTitle)
      const updated = await window.api.detect.link(profile.name, exePath, identity.steamAppId)
      useProfilesStore.getState().upsert(updated)
      setLinking(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function unlink(): Promise<void> {
    useProfilesStore.getState().upsert(await window.api.detect.unlink(profile.name))
  }

  const STATUS_OPTIONS: { value: Status; label: string }[] = [
    { value: 'not_started', label: t('status_not_started') },
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
        <label className="mb-1 block text-xs text-subtext">{t('label_linked_exe')}</label>
        {profile.exePath ? (
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 truncate rounded bg-card px-2.5 py-1.5 text-xs text-subtext" title={profile.exePath}>
              {basename(profile.exePath)}
              {profile.steamAppId != null && ` · appid ${profile.steamAppId}`}
            </div>
            <button
              onClick={() => void unlink()}
              className="shrink-0 rounded bg-card px-3 py-1.5 text-xs text-text hover:text-accent"
            >
              {t('btn_unlink_exe')}
            </button>
          </div>
        ) : linking ? (
          <div className="rounded bg-card/40 p-2">
            <RunningAppPicker busy={busy} onPick={(a) => void link(a.exePath, a.title)} />
          </div>
        ) : (
          <button
            onClick={() => setLinking(true)}
            className="w-full rounded bg-card px-3 py-1.5 text-sm text-text hover:bg-card/70"
          >
            {t('btn_link_exe')}
          </button>
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

/**
 * Exported so the Timer tab can offer Add/Remove time on its own, without
 * opening the whole editor. Same component in both places, so the two can
 * never drift apart.
 *
 * Two steps: enter the amount, then — only if the game has sub-categories —
 * choose which ones also get it. Main always receives the full delta
 * regardless of what's ticked; unticking every category is valid and just
 * means main-only, identical to a game with no sub-categories at all.
 */
export function TimeTab({ profile }: { profile: Profile }): React.JSX.Element {
  const { t } = useTranslation()
  const globalSubCategoriesEnabled = useSettingsStore((s) => s.settings?.subCategoriesEnabled ?? true)
  const subCategoriesEnabled = profile.subCategoriesEnabled ?? globalSubCategoriesEnabled
  const hasSelectableCategories = subCategoriesEnabled && profile.subCategories.length > 0
  async function setAutoStart(value: boolean | null): Promise<void> {
    useProfilesStore.getState().upsert(await window.api.detect.setAutoStartTimer(profile.name, value))
  }
  const [direction, setDirection] = useState<'add' | 'remove'>('add')
  const [hours, setHours] = useState('0')
  const [minutes, setMinutes] = useState('0')
  const [step, setStep] = useState<'amount' | 'categories'>('amount')
  const [pendingDelta, setPendingDelta] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  async function resetTime(): Promise<void> {
    if (!window.confirm(t('confirm_reset_time_msg', { name: profile.name }))) return
    useProfilesStore.getState().upsert(await window.api.profiles.resetTime(profile.name))
  }

  /** Reads the Hours/Minutes inputs, validates, and returns a signed total — or null (after toasting) if it's zero. */
  function readDelta(): number | null {
    const h = parseInt(hours, 10) || 0
    const m = parseInt(minutes, 10) || 0
    const deltaSeconds = h * 3600 + m * 60
    if (deltaSeconds <= 0) {
      toast.error(t('err_add_time_empty'))
      return null
    }
    return direction === 'remove' ? -deltaSeconds : deltaSeconds
  }

  async function commit(signed: number, subCategoryIds: string[]): Promise<void> {
    const updated = await window.api.profiles.addRemoveTime(profile.name, signed, subCategoryIds)
    useProfilesStore.getState().upsert(updated)
    setHours('0')
    setMinutes('0')
    setStep('amount')
    setSelectedIds(new Set())
  }

  async function continueOrApply(): Promise<void> {
    const signed = readDelta()
    if (signed == null) return
    if (!hasSelectableCategories) {
      await commit(signed, [])
      return
    }
    setPendingDelta(signed)
    setStep('categories')
  }

  async function applyWithCategories(): Promise<void> {
    await commit(pendingDelta, Array.from(selectedIds))
  }

  function toggleCategory(id: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* A timer setting, so it lives with the timer rather than with the art. */}
      {(profile.steamAppId != null || profile.exePath) && (
        <div className="border-b border-card pb-4">
          <label className="mb-1 block text-xs text-subtext">{t('label_auto_start')}</label>
          <div className="flex gap-1.5">
            {(
              [
                [null, t('label_auto_art_follow')],
                [true, t('label_auto_art_on')],
                [false, t('label_auto_art_off')]
              ] as [boolean | null, string][]
            ).map(([value, label]) => (
              <button
                key={String(value)}
                onClick={() => void setAutoStart(value)}
                className={`flex-1 rounded px-2 py-1.5 text-xs transition-colors ${
                  profile.autoStartTimer === value ? 'bg-accent text-bg' : 'bg-card text-text hover:bg-card/70'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'amount' && (
        <>
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
              <label htmlFor="addtime-hours" className="mb-1 block text-xs text-subtext">
                {t('label_hours')}
              </label>
              <input
                id="addtime-hours"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="w-full rounded bg-card px-2.5 py-1.5 text-sm text-text outline-none"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="addtime-minutes" className="mb-1 block text-xs text-subtext">
                {t('label_minutes')}
              </label>
              <input
                id="addtime-minutes"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className="w-full rounded bg-card px-2.5 py-1.5 text-sm text-text outline-none"
              />
            </div>
          </div>
          <button
            onClick={() => void continueOrApply()}
            className="self-start rounded bg-accent px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90"
          >
            {hasSelectableCategories ? t('addtime_continue') : t('btn_apply')}
          </button>
        </>
      )}

      {step === 'categories' && (
        <>
          <div>
            <div className={`text-sm font-medium ${pendingDelta < 0 ? 'text-red' : 'text-accent'}`}>
              {pendingDelta < 0 ? '−' : '+'}
              {formatSeconds(Math.abs(pendingDelta))}
            </div>
            <p className="mt-1 text-xs text-subtext">{t('addtime_step2_question')}</p>
          </div>
          <div className="flex gap-3 text-xs">
            <button
              onClick={() => setSelectedIds(new Set(profile.subCategories.map((c) => c.id)))}
              className="text-accent hover:opacity-80"
            >
              {t('addtime_select_all')}
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="text-accent hover:opacity-80">
              {t('addtime_select_none')}
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {profile.subCategories.map((cat) => (
              <label
                key={cat.id}
                className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-sm text-text hover:bg-card/60"
              >
                <input type="checkbox" checked={selectedIds.has(cat.id)} onChange={() => toggleCategory(cat.id)} />
                {cat.name}
              </label>
            ))}
          </div>
          <p className="text-xs text-subtext">{t('addtime_main_note')}</p>
          <div className="flex gap-2">
            <button
              onClick={() => setStep('amount')}
              className="rounded bg-card px-4 py-1.5 text-sm text-text hover:bg-card/70"
            >
              {t('btn_back')}
            </button>
            <button
              onClick={() => void applyWithCategories()}
              className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90"
            >
              {t('btn_apply')}
            </button>
          </div>
        </>
      )}

      {/*
       * D1: resetting the clock is a time action, so it belongs on the Time tab
       * beside the time — it was previously only reachable from a context menu.
       * Destructive, so it sits below the divider, in red, behind a confirm.
       */}
      <div className="mt-1 border-t border-card pt-4">
        <button
          onClick={() => void resetTime()}
          className="rounded px-3 py-1.5 text-xs text-red transition-colors hover:bg-red hover:text-bg"
        >
          {t('ctx_reset_time')}
        </button>
      </div>
    </div>
  )
}

function AppearanceTab({ profile }: { profile: Profile }): React.JSX.Element {
  const { t } = useTranslation()
  async function chooseIcon(): Promise<void> {
    const updated = await window.api.profiles.setIcon(profile.name)
    if (updated) useProfilesStore.getState().upsert(updated)
  }
  async function chooseBackgroundImage(): Promise<void> {
    const updated = await window.api.profiles.setBackground(profile.name, 'image', '')
    if (updated) useProfilesStore.getState().upsert(updated)
  }

  // Every candidate image for this game, fetched once when the tab opens.
  // URLs only — nothing is downloaded until one is actually clicked.
  const [art, setArt] = useState<ArtOptions | null>(null)
  const [refreshingArt, setRefreshingArt] = useState(false)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    if (profile.steamAppId == null && !profile.exePath) return
    void window.api.detect.artOptions(profile.name, profile.steamAppId).then(setArt)
  }, [profile.name, profile.steamAppId, profile.exePath])

  async function pickArt(kind: 'icon' | 'background', url: string): Promise<void> {
    setApplying(true)
    try {
      useProfilesStore.getState().upsert(await window.api.detect.setArtFromUrl(profile.name, kind, url))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }

  async function setAutoArt(value: boolean | null): Promise<void> {
    useProfilesStore.getState().upsert(await window.api.profiles.setAutoFetchArt(profile.name, value))
  }
  async function refreshArt(): Promise<void> {
    setRefreshingArt(true)
    try {
      useProfilesStore.getState().upsert(await window.api.profiles.refreshArt(profile.name))
    } finally {
      setRefreshingArt(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/*
       * Only meaningful once a game has SOMETHING to fetch art by — an appid,
       * or a name plus exePath for the Epic/GOG/SteamGridDB/exe-icon chain
       * enrichGame() also supports (refreshArt itself already handles a null
       * appid fine, see its own doc comment) — so it's hidden entirely for a
       * purely manually-added game rather than shown as a control that
       * silently does nothing. Previously gated on steamAppId alone, which
       * hid this for every EA/Epic/GOG/Battle.net-detected game — exactly
       * the games with no appid that most need a way to re-fetch or pick
       * better art.
       */}
      {(profile.steamAppId != null || profile.exePath) && (
        <div>
          <label className="mb-1 block text-xs text-subtext">{t('label_auto_art')}</label>
          <div className="flex gap-1.5">
            {(
              [
                [null, t('label_auto_art_follow')],
                [true, t('label_auto_art_on')],
                [false, t('label_auto_art_off')]
              ] as [boolean | null, string][]
            ).map(([value, label]) => (
              <button
                key={String(value)}
                onClick={() => void setAutoArt(value)}
                className={`flex-1 rounded px-2 py-1.5 text-xs transition-colors ${
                  profile.autoFetchArt === value ? 'bg-accent text-bg' : 'bg-card text-text hover:bg-card/70'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => void refreshArt()}
            disabled={refreshingArt}
            className="mt-1.5 flex w-full items-center justify-center gap-2 rounded bg-card py-1.5 text-xs text-subtext hover:text-text disabled:opacity-60"
          >
            {refreshingArt && <Spinner className="h-3 w-3" />}
            {t('btn_refresh_art')}
          </button>
        </div>
      )}

      {art && (art.icons.length > 0 || art.backgrounds.length > 0) && (
        <div className="flex flex-col gap-3">
          {/*
           * The automatic pick is a default, not an answer — key art is taste,
           * and offering only the one the fetcher ranked first left "it chose
           * one I dislike" with no remedy. Everything found is shown; only the
           * image actually clicked gets downloaded.
           */}
          <ArtStrip
            label={t('label_icon')}
            options={art.icons}
            disabled={applying}
            onPick={(u) => void pickArt('icon', u)}
            tall
          />
          <ArtStrip
            label={t('label_background')}
            options={art.backgrounds}
            disabled={applying}
            onPick={(u) => void pickArt('background', u)}
          />
        </div>
      )}

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
        <button
          onClick={() => void chooseBackgroundImage()}
          className="rounded bg-card px-3 py-1.5 text-sm text-text hover:bg-card/70"
        >
          {t('btn_choose_image')}
        </button>
      </div>
    </div>
  )
}

function GenresTab({ profile }: { profile: Profile }): React.JSX.Element {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<Set<string>>(new Set(profile.genres))
  // Locked whenever the genres came from Steam/GOG rather than from the user,
  // so a fetched set is not edited by accident. Unlockable on purpose: Steam's
  // tags are good but not infallible, and being stuck with a wrong set would
  // be worse than the accident this prevents.
  const [unlocked, setUnlocked] = useState(false)
  const locked = profile.genresFromDetection && !unlocked

  function toggle(genre: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(genre)) next.delete(genre)
      else next.add(genre)
      return next
    })
  }

  async function apply(): Promise<void> {
    const genres = [...selected]
    useProfilesStore.getState().upsert(await window.api.profiles.setGenres(profile.name, genres))
  }

  return (
    <div className="flex flex-col gap-3">
      {locked && (
        <div className="flex items-center justify-between gap-3 rounded bg-card px-3 py-2">
          <span className="text-xs text-subtext">{t('note_genres_fetched')}</span>
          <button
            onClick={() => setUnlocked(true)}
            className="shrink-0 rounded bg-panel px-2.5 py-1 text-xs text-text hover:text-accent"
          >
            {t('btn_unlock_genres')}
          </button>
        </div>
      )}
      <div className={`grid max-h-80 grid-cols-2 gap-1 overflow-y-auto ${locked ? 'opacity-50' : ''}`}>
        {GENRE_OPTIONS.map((g) => (
          <label
            key={g}
            className={`flex items-center gap-2 rounded px-2 py-1 text-sm text-text ${locked ? '' : 'hover:bg-card'}`}
          >
            <input
              type="checkbox"
              checked={selected.has(g)}
              disabled={locked}
              onChange={() => toggle(g)}
            />
            {t(g, { ns: 'genres' })}
          </label>
        ))}
      </div>
      {!locked && (
        <button
          onClick={() => void apply()}
          className="self-start rounded bg-accent px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90"
        >
          {t('btn_assign')}
        </button>
      )}
    </div>
  )
}

/**
 * A horizontally scrolling row of candidate images. Kept scrollable rather
 * than wrapped: a game can return sixteen screenshots, and a grid of those
 * would push everything else in the tab off screen.
 */
function ArtStrip({
  label,
  options,
  disabled,
  onPick,
  tall
}: {
  label: string
  options: { url: string; thumb: string }[]
  disabled: boolean
  onPick: (url: string) => void
  tall?: boolean
}): React.JSX.Element | null {
  // Main already drops candidates that 404, but a tile that fails for any
  // other reason should disappear rather than sit there as a broken image.
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const visible = options.filter((o) => !failed.has(o.url))
  if (visible.length === 0) return null
  return (
    <div>
      <label className="mb-1 block text-xs text-subtext">{label}</label>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {visible.map((o) => (
          <button
            key={o.url}
            disabled={disabled}
            onClick={() => onPick(o.url)}
            className={`shrink-0 overflow-hidden rounded ring-1 ring-transparent transition hover:ring-accent disabled:opacity-50 ${
              tall ? 'h-14' : 'h-14 w-24'
            }`}
          >
            {/* Proxied through main — the renderer's CSP forbids remote images,
                and that restriction is worth keeping. */}
            <img
              src={`gt-asset://remote/${encodeURIComponent(o.thumb)}`}
              className="h-full w-full object-cover"
              alt=""
              loading="lazy"
              onError={() => setFailed((prev) => new Set(prev).add(o.url))}
            />
          </button>
        ))}
      </div>
    </div>
  )
}
