import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useProfilesStore } from '../../state/profilesStore'
import { useTimerStore } from '../../state/timerStore'
import { useUiStore, launchGame, selectProfile } from '../../state/uiStore'
import { formatSeconds } from '@shared/format'
import { summaryFrom } from '@shared/sessionStats'
import { GameArt } from './GameArt'
import { FavoriteStar } from './FavoriteStar'
import { toast } from '../common/Toast'
import type { Status } from '@shared/types'

/** Same wash as the Timer view — see SelectedGameView for why it's a background layer rather than an overlay. */
const ACCENT_WASH =
  'linear-gradient(color-mix(in srgb, var(--gt-accent) 16%, transparent), color-mix(in srgb, var(--gt-accent) 16%, transparent))'

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[0.65rem] tracking-wide text-subtext uppercase">{label}</span>
      <span className="text-sm text-text tabular-nums">{value}</span>
    </div>
  )
}

/**
 * A game's home inside the Library: everything you can know or do about one
 * game, in one place, without leaving the tab you were browsing in.
 *
 * The one thing that does leave is Launch — see launchGame(). Clicking a game
 * in the grid is navigation and must stay cheap; starting to play is the real
 * transition, and it earns the tab switch.
 */
export function LibraryDetail({ name }: { name: string }): React.JSX.Element {
  const { t } = useTranslation()
  const profile = useProfilesStore((s) => s.profiles[name])
  const liveSeconds = useTimerStore((s) => s.running[name])
  const setLibraryFocus = useUiStore((s) => s.setLibraryFocus)
  const openDialog = useUiStore((s) => s.openDialog)

  // The game can vanish under this view (deleted from the context menu, or a
  // rename landing as a different key), so falling back to the grid is a real
  // path, not a defensive nicety.
  if (!profile) {
    return (
      <div className="grid h-full place-items-center">
        <button onClick={() => setLibraryFocus(null)} className="text-sm text-accent hover:underline">
          {t('btn_back_library')}
        </button>
      </div>
    )
  }

  const isRunning = liveSeconds !== undefined
  const seconds = liveSeconds ?? profile.seconds
  const summary = summaryFrom(profile.sessionStats)
  const canLaunch = profile.steamAppId != null || !!profile.exePath

  const STATUS_LABEL: Record<Status, string> = {
    in_progress: t('status_in_progress'),
    completed: t('status_completed'),
    dropped: t('status_dropped'),
    on_hold: t('status_on_hold')
  }

  async function togglePlay(): Promise<void> {
    // Pressing Play here is also a statement that this is what you're playing,
    // so it points the Timer tab at this game — without switching to it, since
    // you chose to press Play from the Library.
    await selectProfile(name)
    if (isRunning) await window.api.timer.pause(name)
    else await window.api.timer.start(name)
    useProfilesStore.getState().setAll(await window.api.profiles.list())
  }

  async function toggleComplete(): Promise<void> {
    const next: Status = profile!.status === 'completed' ? 'in_progress' : 'completed'
    useProfilesStore.getState().upsert(await window.api.profiles.setStatus(name, next))
  }

  async function setRating(rating: 0 | 1 | 2 | 3 | 4 | 5): Promise<void> {
    useProfilesStore.getState().upsert(await window.api.profiles.setRating(name, rating))
  }

  async function handleDuplicate(): Promise<void> {
    useProfilesStore.getState().upsert(await window.api.profiles.duplicate(name))
  }

  async function handleExport(): Promise<void> {
    const result = await window.api.importExport.exportProfile(name)
    if (result) toast.info(t('info_exported_msg', { path: result.path }))
  }

  async function handleDelete(): Promise<void> {
    if (!window.confirm(t('confirm_delete_msg', { name }))) return
    await window.api.profiles.delete(name)
    useProfilesStore.getState().remove(name)
    setLibraryFocus(null)
  }

  const heroStyle: CSSProperties = profile.bgImage
    ? {
        backgroundImage: `${ACCENT_WASH}, url(gt-asset://backgrounds/${encodeURIComponent(profile.bgImage)})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundBlendMode: 'color'
      }
    : profile.bgColor
      ? { backgroundColor: profile.bgColor, backgroundImage: ACCENT_WASH, backgroundBlendMode: 'color' }
      : { backgroundImage: ACCENT_WASH, backgroundBlendMode: 'color' }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="relative" style={heroStyle}>
        {/*
         * The scrim is heavier than a background usually needs because this one
         * sits under text rather than beside it — a hero image is arbitrary
         * artwork, and at /50 the back link and the status line were competing
         * with whatever happened to be behind them.
         */}
        <div className="bg-bg/75 px-5 py-4">
          <button
            onClick={() => setLibraryFocus(null)}
            className="mb-4 text-xs text-text/80 transition-colors hover:text-text"
          >
            ← {t('btn_back_library')}
          </button>

          <div className="flex flex-wrap items-end gap-5">
            <div className="h-44 w-30 shrink-0 overflow-hidden rounded-lg shadow-lg" style={{ width: 118 }}>
              <GameArt profile={profile} />
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex items-center gap-2">
                <h2 className="min-w-0 text-2xl font-semibold break-words text-text">{profile.name}</h2>
                <FavoriteStar name={profile.name} favorite={profile.favorite} size={20} />
              </div>

              <div className={`text-sm ${isRunning ? 'text-green' : 'text-text/70'}`}>
                {isRunning ? t('status_tracking') : STATUS_LABEL[profile.status]}
              </div>

              <div className="font-mono text-4xl font-bold tabular-nums text-text">
                {formatSeconds(seconds)}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {canLaunch && (
                  <button
                    onClick={() => void launchGame(profile.name)}
                    className="rounded-lg bg-card px-4 py-2 text-sm font-medium text-text transition-opacity hover:opacity-80"
                  >
                    {t('btn_launch_game')}
                  </button>
                )}
                <button
                  onClick={() => void togglePlay()}
                  className={`rounded-lg px-5 py-2 text-sm font-semibold text-bg transition-opacity hover:opacity-90 ${
                    isRunning ? 'bg-red' : 'bg-green'
                  }`}
                >
                  {isRunning ? t('btn_pause') : t('btn_play')}
                </button>
                <button
                  onClick={() => void toggleComplete()}
                  className={`rounded-lg px-5 py-2 text-sm font-semibold transition-opacity hover:opacity-90 ${
                    profile.status === 'completed' ? 'bg-accent text-bg' : 'bg-gold text-bg'
                  }`}
                >
                  {t('btn_complete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5 px-5 py-4">
        <div className="flex flex-wrap gap-x-10 gap-y-4">
          <Stat label={t('col_time_played')} value={formatSeconds(seconds)} />
          <Stat label={t('stat_sessions')} value={String(summary.sessions)} />
          <Stat
            label={t('stat_avg_session')}
            value={summary.sessions > 0 ? formatSeconds(summary.averageSeconds) : '—'}
          />
          {profile.status === 'completed' && (
            <Stat
              label={t('col_time_to_beat')}
              value={profile.statusSeconds != null ? formatSeconds(profile.statusSeconds) : '—'}
            />
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[0.65rem] tracking-wide text-subtext uppercase">{t('label_rating')}</span>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                aria-label={`${n}`}
                // Clicking the star that's already the rating clears it, so a
                // rating can be undone without a separate control.
                onClick={() => void setRating((n === profile.rating ? 0 : n) as 0 | 1 | 2 | 3 | 4 | 5)}
                className={`text-xl leading-none transition-colors ${
                  n <= profile.rating ? 'text-gold' : 'text-subtext hover:text-gold'
                }`}
              >
                {n <= profile.rating ? '★' : '☆'}
              </button>
            ))}
          </div>
        </div>

        {profile.genres.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[0.65rem] tracking-wide text-subtext uppercase">{t('col_genres')}</span>
            <div className="flex flex-wrap gap-1.5">
              {profile.genres.map((g) => (
                <span key={g} className="rounded-full bg-card px-2.5 py-0.5 text-xs text-subtext">
                  {t(g, { ns: 'genres' })}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* All management lives in Library, which is what lets the Timer tab's right-click menu shrink to timing actions only. */}
        <div className="flex flex-wrap gap-2 border-t border-card/60 pt-4">
          {[
            { label: t('ctx_modify'), onClick: () => openDialog('modify', name) },
            { label: t('ctx_info'), onClick: () => openDialog('info', name) },
            { label: t('ctx_notes'), onClick: () => openDialog('notes', name) },
            { label: t('ctx_duplicate'), onClick: () => void handleDuplicate() },
            { label: t('ctx_export'), onClick: () => void handleExport() }
          ].map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              className="rounded bg-card px-3 py-1.5 text-xs text-text transition-opacity hover:opacity-80"
            >
              {action.label}
            </button>
          ))}
          <button
            onClick={() => void handleDelete()}
            className="ml-auto rounded px-3 py-1.5 text-xs text-red transition-colors hover:bg-red hover:text-bg"
          >
            {t('ctx_delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
