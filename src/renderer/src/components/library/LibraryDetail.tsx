import { useState } from 'react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useProfilesStore } from '../../state/profilesStore'
import { useTimerStore } from '../../state/timerStore'
import { useUiStore, launchGame, stopGame, selectProfile } from '../../state/uiStore'
import { useOpenGamesStore } from '../../state/openGamesStore'
import { useSettingsStore } from '../../state/settingsStore'
import { useTimeFormat } from '../../state/useTimeFormat'
import { formatSeconds } from '@shared/format'
import { summaryFrom } from '@shared/sessionStats'
import { GameArt } from './GameArt'
import { FavoriteStar } from './FavoriteStar'
import { PlayHistoryChart } from '../charts/PlayHistoryChart'
import { selectPlayHistoryBuckets } from '../charts/playHistoryBuckets'
import { emptyPlayHistory } from '@shared/playHistory'
import { toast } from '../common/Toast'
import type { Status, SubCategory } from '@shared/types'

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
 * One row in the sub-category list. Renaming is inline-edit (a real
 * <input>), the same pattern NoteEditor's title already uses — never
 * window.prompt(), which Electron does not implement (see addSubCategory's
 * comment above).
 */
function SubCategoryRow({
  gameName,
  category
}: {
  gameName: string
  category: SubCategory
}): React.JSX.Element {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(category.name)
  // Live while this category is the one actively assigned to a running
  // session for this game — same mechanism as the main timer's own
  // liveSeconds, so this ticks every UI_TICK_MS instead of only refreshing
  // on pause. Falls back to the last-persisted value otherwise.
  const liveCategory = useTimerStore((s) => s.runningCategories[gameName])
  const timeFormat = useTimeFormat()
  const displaySeconds =
    liveCategory && liveCategory.categoryId === category.id ? liveCategory.seconds : category.seconds

  async function commit(): Promise<void> {
    setEditing(false)
    const trimmed = draft.trim()
    if (!trimmed || trimmed === category.name) {
      setDraft(category.name)
      return
    }
    try {
      useProfilesStore
        .getState()
        .upsert(await window.api.profiles.renameSubCategory(gameName, category.id, trimmed))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
      setDraft(category.name)
    }
  }

  async function handleDelete(): Promise<void> {
    if (
      !window.confirm(
        t('subcat_delete_confirm', { name: category.name, time: formatSeconds(displaySeconds, timeFormat) })
      )
    )
      return
    useProfilesStore.getState().upsert(await window.api.profiles.deleteSubCategory(gameName, category.id))
  }

  return (
    <div className="flex items-center justify-between rounded px-2 py-1 hover:bg-panel">
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setDraft(category.name)
              setEditing(false)
            }
          }}
          className="min-w-0 flex-1 rounded bg-panel px-1.5 py-0.5 text-sm text-text outline-none ring-1 ring-accent"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="min-w-0 flex-1 truncate text-left text-sm text-text hover:underline"
        >
          {category.name}
        </button>
      )}
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs tabular-nums text-subtext">{formatSeconds(displaySeconds, timeFormat)}</span>
        <button onClick={() => void handleDelete()} className="text-xs text-red hover:underline">
          {t('ctx_delete')}
        </button>
      </div>
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
  const isUnstoppable = useOpenGamesStore((s) => s.unstoppable.has(name))
  const globalSubCategoriesEnabled = useSettingsStore((s) => s.settings?.subCategoriesEnabled ?? true)
  const timeFormat = useTimeFormat()
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
  //
  // Battle.net is excluded outright: found live that neither the battlenet://
  // URI nor Battle.net.exe's own documented --exec="launch_uid <code>" flag
  // actually starts the game — both just bring the client to the front (the
  // URI at least lands on the right game's page, one manual Play click away,
  // which is what launchUri still gets used for elsewhere — screenshots,
  // "open .exe directory", etc. — just not a Launch button that would imply
  // Gamut can start the game itself, when it measurably can't).
  const isBattleNetLaunch = profile.launchUri?.toLowerCase().startsWith('battlenet://') ?? false
  const canLaunch = !isBattleNetLaunch && (profile.steamAppId != null || !!profile.launchUri || !!profile.exePath)
  const subCategoriesEnabled = profile.subCategoriesEnabled ?? globalSubCategoriesEnabled
  // What the toggle actually reflects and controls — not the raw enabled
  // flag. A brand-new game inherits the global default (true), so the raw
  // flag would show checked even with zero categories; a first click on an
  // already-checked toggle would then just disable it instead of creating
  // anything. Tying "checked" to "is the section actually showing" makes
  // the very first click always do what it visually promises.
  const hasVisibleSubCategories = subCategoriesEnabled && profile.subCategories.length > 0

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
    // hasVisibleSubCategories, not raw data presence — a game with the
    // toggle off behaves exactly like one with no data at all.
    if (next === 'completed' && hasVisibleSubCategories) {
      openDialog('completeTimerPicker', name)
      return
    }
    useProfilesStore.getState().upsert(await window.api.profiles.setStatus(name, next))
  }

  async function setRating(rating: 0 | 1 | 2 | 3 | 4 | 5): Promise<void> {
    useProfilesStore.getState().upsert(await window.api.profiles.setRating(name, rating))
  }

  /**
   * No name is collected up front — window.prompt() does not work in
   * Electron (returns null, no dialog ever shown; measured live, not
   * assumed). Creates with a placeholder and lets SubCategoryRow's inline
   * edit (a real <input>, same pattern NoteEditor's title already uses)
   * handle renaming, exactly like "+ New note" does for Notes.
   */
  async function addSubCategory(): Promise<void> {
    useProfilesStore.getState().upsert(await window.api.profiles.createSubCategory(name))
  }

  /**
   * The single entry point for the whole feature, replacing the old
   * right-click "+ New sub-category" — there was no way to start using it
   * from a game's own page, and a separate right-click item plus an
   * in-section checkbox was two controls doing overlapping jobs. Turning
   * this on for a game with none yet creates the first one automatically;
   * turning it off hides the section but never deletes the data — it's
   * still there, still totalled correctly, the moment it's turned back on.
   *
   * Turning on while the timer is ALREADY running is a special case: the
   * natural "which category?" prompt only ever fires on the transition into
   * running (see timerStore's shouldPromptFor), which already happened
   * before this toggle existed for this session — so it would otherwise
   * never fire at all, and the time already elapsed this session would have
   * no way to land in a category. timerEngine snapshots pendingCategoryStart
   * at Play time unconditionally, regardless of whether sub-categories were
   * even enabled then, so opening the same prompt here still credits the
   * FULL elapsed session once answered, not just the time since toggling.
   */
  async function toggleSubCategoriesEnabled(): Promise<void> {
    // Toggling "on" from the user's point of view means "show something" —
    // covers both the disabled case and the enabled-but-empty case (a fresh
    // game inheriting an enabled global default with nothing created yet).
    const turningOn = !hasVisibleSubCategories
    const updated = await window.api.profiles.setSubCategoriesEnabled(name, turningOn)
    useProfilesStore.getState().upsert(updated)
    if (turningOn && isRunning) {
      openDialog('subCategoryPrompt', name)
      return
    }
    if (turningOn && updated.subCategories.length === 0) {
      useProfilesStore.getState().upsert(await window.api.profiles.createSubCategory(name))
    }
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
      <div className="min-h-0 flex flex-1 flex-col overflow-y-auto">
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

                <div className="flex flex-wrap items-center gap-3">
                  <div className="font-mono text-4xl font-bold tabular-nums text-text">
                    {formatSeconds(seconds, timeFormat)}
                  </div>
                  <label className="flex w-fit items-center gap-1.5 text-xs text-subtext">
                    <input
                      type="checkbox"
                      checked={hasVisibleSubCategories}
                      onChange={() => void toggleSubCategoriesEnabled()}
                      className="h-3.5 w-3.5 accent-[var(--gt-accent)]"
                    />
                    {t('subcat_enable_toggle')}
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/*
                   * Deliberately NOT both gated on canLaunch together — Stop
                   * only needs the process to actually be open, regardless of
                   * whether Gamut itself is able to start it (a Battle.net
                   * game the user launched by hand is still stoppable the
                   * normal way once running; it's specifically LAUNCHING it
                   * that Gamut can't do).
                   */}
                  {isProcessOpen ? (
                    <button
                      onClick={() => void handleStop()}
                      disabled={isUnstoppable}
                      title={isUnstoppable ? t('hint_stop_game_unstoppable') : undefined}
                      className="rounded-lg bg-red px-4 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:opacity-40"
                    >
                      {t('btn_stop_game')}
                    </button>
                  ) : (
                    canLaunch && (
                      <button
                        onClick={() => void launchGame(profile.name)}
                        className="rounded-lg bg-card px-4 py-2 text-sm font-medium text-text transition-opacity hover:opacity-80"
                      >
                        {t('btn_launch_game')}
                      </button>
                    )
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
                  <button
                    onClick={() => openDialog('activeTimers')}
                    className="rounded-lg bg-card px-4 py-2 text-sm font-medium text-text transition-opacity hover:opacity-80"
                  >
                    {t('btn_active_timers')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 px-5 py-4">
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            <Stat label={t('col_time_played')} value={formatSeconds(seconds, timeFormat)} />
            <Stat label={t('stat_sessions')} value={String(summary.sessions)} />
            <Stat label={t('stat_avg_session')} value={summary.sessions > 0 ? formatSeconds(summary.averageSeconds, timeFormat) : '—'} />
            {profile.status === 'completed' && (
              <Stat label={t('col_time_to_beat')} value={profile.statusSeconds != null ? formatSeconds(profile.statusSeconds, timeFormat) : '—'} />
            )}
          </div>

          <section className="play-history-overview" aria-label="Play history">
            <div className="flex justify-end gap-3">
              <button onClick={() => openDialog('playHistory', name)} className="text-xs text-accent hover:underline">More details</button>
            </div>
            <PlayHistoryChart title="Play history, last seven days" selection={selectPlayHistoryBuckets(profile.playHistory ?? emptyPlayHistory(), 'sevenDays')} timeFormat={timeFormat} compact />
          </section>

                    <div className="play-history-details flex flex-col gap-5">
<div className="flex flex-col gap-1.5">
            <span className="text-[0.65rem] tracking-wide text-subtext uppercase">{t('label_rating')}</span>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} aria-label={`${n}`} onClick={() => void setRating((n === profile.rating ? 0 : n) as 0 | 1 | 2 | 3 | 4 | 5)} className={`text-xl leading-none transition-colors ${n <= profile.rating ? 'text-gold' : 'text-subtext hover:text-gold'}`}>
                  {n <= profile.rating ? '★' : '☆'}
                </button>
              ))}
            </div>
          </div>

          {hasVisibleSubCategories && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[0.65rem] tracking-wide text-subtext uppercase">{t('subcat_heading')}</span>
                <button onClick={() => void addSubCategory()} className="text-xs text-accent hover:underline">{t('subcat_new')}</button>
              </div>
              <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto rounded-lg bg-card p-1.5">
                {profile.subCategories.map((c) => <SubCategoryRow key={c.id} gameName={name} category={c} />)}
              </div>
            </div>
          )}

          {profile.genres.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[0.65rem] tracking-wide text-subtext uppercase">{t('col_genres')}</span>
              <div className="flex flex-wrap gap-1.5">
                {profile.genres.map((g) => <span key={g} className="rounded-full bg-card px-2.5 py-0.5 text-xs text-subtext">{t(g, { ns: 'genres' })}</span>)}
              </div>
            </div>
          )}
          </div>
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
