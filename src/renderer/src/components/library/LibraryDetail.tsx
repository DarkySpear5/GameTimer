import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useProfilesStore } from '../../state/profilesStore'
import { useTimerStore } from '../../state/timerStore'
import { useUiStore, launchGame, stopGame, selectProfile } from '../../state/uiStore'
import { useOpenGamesStore } from '../../state/openGamesStore'
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
  const isProcessOpen = useOpenGamesStore((s) => s.open.has(name))
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
  // Xbox/Store games have NEITHER an appid nor a runnable .exe — they launch by
  // AUMID — so launchUri has to count here or their button never appears.
  const canLaunch = profile.steamAppId != null || !!profile.launchUri || !!profile.exePath

  const STATUS_LABEL: Record<Status, string> = {
    not_started: t('status_not_started'),
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

  async function handleStop(): Promise<void> {
    if (!window.confirm(t('confirm_stop_game_msg'))) return
    await stopGame(name)
  }

  async function toggleComplete(): Promise<void> {
    const next: Status = profile!.status === 'completed' ? 'in_progress' : 'completed'
    if (next === 'completed' && profile!.subCategories.length > 0) {
      openDialog('completeTimerPicker', name)
      return
    }
    useProfilesStore.getState().upsert(await window.api.profiles.setStatus(name, next))
  }

  async function setRating(rating: 0 | 1 | 2 | 3 | 4 | 5): Promise<void> {
    useProfilesStore.getState().upsert(await window.api.profiles.setRating(name, rating))
  }

  async function addSubCategory(): Promise<void> {
    const categoryName = window.prompt(t('subcat_new_name_prompt'))
    if (!categoryName || !categoryName.trim()) return
    useProfilesStore.getState().upsert(await window.api.profiles.createSubCategory(name, categoryName))
  }

  async function renameSubCategory(categoryId: string, currentName: string): Promise<void> {
    const newName = window.prompt(t('subcat_new_name_prompt'), currentName)
    if (!newName || !newName.trim() || newName === currentName) return
    useProfilesStore
      .getState()
      .upsert(await window.api.profiles.renameSubCategory(name, categoryId, newName))
  }

  async function deleteSubCategory(categoryId: string, categoryName: string, seconds: number): Promise<void> {
    if (!window.confirm(t('subcat_delete_confirm', { name: categoryName, time: formatSeconds(seconds) })))
      return
    useProfilesStore.getState().upsert(await window.api.profiles.deleteSubCategory(name, categoryId))
  }

  /** D4: the counterpart to Export — pulls a .gtprofile in as a new game. */
  async function handleImport(): Promise<void> {
    const imported = await window.api.importExport.importProfile()
    if (imported) {
      useProfilesStore.getState().upsert(imported)
      toast.info(t('info_imported_msg', { name: imported.name }))
    }
  }

  async function handleExport(): Promise<void> {
    const result = await window.api.importExport.exportProfile(name)
    if (result) toast.info(t('info_exported_msg', { path: result.path }))
  }

  /** J5: shows the .exe selected in Explorer, or the install folder for a game with none on disk (Steam/Store). */
  async function handleOpenExeDirectory(): Promise<void> {
    const { opened } = await window.api.detect.openExeDirectory(name)
    if (!opened) toast.error(t('err_open_exe_directory'))
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
    /*
     * The action bar is pinned OUTSIDE this scroller, not the last row inside
     * it. Measured in the real app at the window's 880x560 minimum: the row's
     * bottom landed at 571.8px in a 560px viewport, so Modify/Delete were
     * sliced through the middle of their labels — and the only way to reach
     * them was to notice 28px of available scroll, which reads as the buttons
     * simply being broken. Managing a game must not depend on how tall the
     * window happens to be.
     */
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto">
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
                  {canLaunch &&
                    (isProcessOpen ? (
                      <button
                        onClick={() => void handleStop()}
                        className="rounded-lg bg-red px-4 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-80"
                      >
                        {t('btn_stop_game')}
                      </button>
                    ) : (
                      <button
                        onClick={() => void launchGame(profile.name)}
                        className="rounded-lg bg-card px-4 py-2 text-sm font-medium text-text transition-opacity hover:opacity-80"
                      >
                        {t('btn_launch_game')}
                      </button>
                    ))}
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

          {profile.subCategories.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[0.65rem] tracking-wide text-subtext uppercase">
                  {t('subcat_heading')}
                </span>
                <button
                  onClick={() => void addSubCategory()}
                  className="text-xs text-accent hover:underline"
                >
                  {t('subcat_new')}
                </button>
              </div>
              <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto rounded-lg bg-card p-1.5">
                {profile.subCategories.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded px-2 py-1 hover:bg-panel">
                    <button
                      onClick={() => void renameSubCategory(c.id, c.name)}
                      className="truncate text-left text-sm text-text hover:underline"
                    >
                      {c.name}
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs tabular-nums text-subtext">{formatSeconds(c.seconds)}</span>
                      <button
                        onClick={() => void deleteSubCategory(c.id, c.name, c.seconds)}
                        className="text-xs text-red hover:underline"
                      >
                        {t('ctx_delete')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-subtext">
                <input
                  type="checkbox"
                  checked={profile.subCategoriesEnabled ?? true}
                  onChange={(e) =>
                    void (async () => {
                      useProfilesStore
                        .getState()
                        .upsert(
                          await window.api.profiles.setSubCategoriesEnabled(name, e.target.checked)
                        )
                    })()
                  }
                />
                {t('subcat_enable_toggle')}
              </label>
            </div>
          )}

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
        </div>
      </div>

      {/* All management lives in Library, which is what lets the Timer tab's right-click menu shrink to timing actions only. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-card/60 bg-panel px-5 py-3">
        {[
          { label: t('ctx_modify'), onClick: () => openDialog('modify', name) },
          { label: t('ctx_info'), onClick: () => openDialog('info', name) },
          { label: t('ctx_notes'), onClick: () => openDialog('notes', name) },
          { label: t('ctx_export'), onClick: () => void handleExport() },
          { label: t('ctx_screenshots'), onClick: () => openDialog('screenshots', name) },
          { label: t('ctx_import'), onClick: () => void handleImport() },
          // J5: only shown when there's somewhere for it to go — a manually
          // added game with no detected exe or install folder has neither.
          ...(profile.exePath || profile.installDir
            ? [{ label: t('ctx_open_exe_directory'), onClick: () => void handleOpenExeDirectory() }]
            : [])
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
  )
}
