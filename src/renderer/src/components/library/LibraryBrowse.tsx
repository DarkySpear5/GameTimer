import { memo, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProfilesStore } from '../../state/profilesStore'
import { useSettingsStore, updateSettings } from '../../state/settingsStore'
import { useTimerStore } from '../../state/timerStore'
import { useUiStore } from '../../state/uiStore'
import { sortAndFilterProfiles, matchesSearch } from '../../state/selectors'
import { formatSeconds } from '@shared/format'
import { GENRE_OPTIONS } from '@shared/constants'
import { GameArt } from './GameArt'
import { FavoriteStar } from './FavoriteStar'
import type { Profile, SortMode, Status } from '@shared/types'

/** See the identical constant in GameList — a stable reference means non-playtime orderings never re-render on a tick. */
const EMPTY_RUNNING: Record<string, number> = {}

const SORT_OPTIONS: { value: SortMode; labelKey: string }[] = [
  { value: 'name', labelKey: 'sort_name_az' },
  { value: 'name_desc', labelKey: 'sort_name_za' },
  { value: 'last_played', labelKey: 'sort_last_played' },
  { value: 'playtime', labelKey: 'sort_playtime' },
  { value: 'favorite', labelKey: 'sort_favorite' },
  { value: 'rating', labelKey: 'sort_rating_desc' },
  { value: 'genre', labelKey: 'sort_genre_az' },
  { value: 'platform', labelKey: 'sort_platform' }
]

/**
 * One tile subscribes to its own running slice rather than the grid
 * subscribing to the whole record — main pushes a tick every 500ms and
 * otherwise every tile in the library would re-render twice a second because
 * one game is running. Same reasoning as GameRow in the Timer sidebar.
 */
const GameTile = memo(function GameTile({
  profile,
  onOpen,
  onContextMenu
}: {
  profile: Profile
  onOpen: (name: string) => void
  onContextMenu: (e: React.MouseEvent, name: string) => void
}): React.JSX.Element {
  const liveSeconds = useTimerStore((s) => s.running[profile.name])
  const isRunning = liveSeconds !== undefined

  return (
    <button
      onClick={() => onOpen(profile.name)}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(e, profile.name)
      }}
      data-testid="library-item"
      className="group relative flex flex-col gap-2 rounded-lg text-left transition-transform hover:-translate-y-0.5"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-card shadow-sm">
        <GameArt profile={profile} />
        {isRunning && (
          <span className="absolute top-2 left-2 rounded-full bg-green px-2 py-0.5 text-[0.65rem] font-semibold text-bg">
            ●
          </span>
        )}
        {/*
         * A star that is set stays visible; an unset one only appears on hover
         * or keyboard focus, so an unstarred library isn't a wall of grey
         * outlines competing with the art.
         */}
        <div
          className={`absolute top-1 right-1 rounded-full bg-bg/60 backdrop-blur-sm transition-opacity ${
            profile.favorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
          }`}
        >
          <FavoriteStar name={profile.name} favorite={profile.favorite} size={16} />
        </div>
      </div>
      <div className="min-w-0 px-0.5">
        <div
          data-testid="library-item-name"
          className={`truncate text-sm ${isRunning ? 'text-green' : 'text-text'}`}
          title={profile.name}
        >
          {profile.name}
        </div>
        <div className="text-xs tabular-nums text-subtext">
          {formatSeconds(liveSeconds ?? profile.seconds)}
        </div>
      </div>
    </button>
  )
})

const GameListRow = memo(function GameListRow({
  profile,
  statusLabel,
  iconSize,
  onOpen,
  onContextMenu
}: {
  profile: Profile
  statusLabel: string
  /** Settings → Appearance → Icon Size. The list is the only view it governs. */
  iconSize: number
  onOpen: (name: string) => void
  onContextMenu: (e: React.MouseEvent, name: string) => void
}): React.JSX.Element {
  const liveSeconds = useTimerStore((s) => s.running[profile.name])
  const isRunning = liveSeconds !== undefined

  return (
    <button
      onClick={() => onOpen(profile.name)}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(e, profile.name)
      }}
      data-testid="library-item"
      className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-card/60"
    >
      <div className="shrink-0 overflow-hidden rounded" style={{ width: iconSize, height: iconSize }}>
        <GameArt profile={profile} rounded="rounded" preferIcon />
      </div>
      <span
        data-testid="library-item-name"
        className={`min-w-0 flex-1 truncate text-sm ${isRunning ? 'text-green' : 'text-text'}`}
      >
        {profile.name}
      </span>
      <span className="hidden w-28 shrink-0 text-xs text-subtext sm:block">{statusLabel}</span>
      <span className="w-24 shrink-0 text-right text-xs tabular-nums text-subtext">
        {formatSeconds(liveSeconds ?? profile.seconds)}
      </span>
      <div
        className={`shrink-0 transition-opacity ${
          profile.favorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
        }`}
      >
        <FavoriteStar name={profile.name} favorite={profile.favorite} size={16} />
      </div>
    </button>
  )
})

/** A labelled control. The three filters used to be bare dropdowns reading "Name (A-Z) / All / All" — three mystery boxes in the first thing a new user sees. */
function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.65rem] font-medium tracking-wide text-subtext uppercase">{label}</span>
      {children}
    </label>
  )
}

export function LibraryBrowse(): React.JSX.Element {
  const { t } = useTranslation()
  const profiles = useProfilesStore((s) => s.profiles)
  const settings = useSettingsStore((s) => s.settings)
  const setLibraryFocus = useUiStore((s) => s.setLibraryFocus)
  const openContextMenu = useUiStore((s) => s.openContextMenu)
  const openDialog = useUiStore((s) => s.openDialog)

  const [search, setSearch] = useState('')
  const view = settings?.libraryView ?? 'grid'
  const sortMode = settings?.sortMode ?? 'name'
  const running = useTimerStore((s) => (sortMode === 'playtime' ? s.running : EMPTY_RUNNING))

  const STATUS_LABEL: Record<Status, string> = {
    not_started: t('status_not_started'),
    in_progress: t('status_in_progress'),
    completed: t('status_completed'),
    dropped: t('status_dropped'),
    on_hold: t('status_on_hold')
  }

  const sorted = useMemo(() => {
    if (!settings) return []
    const list = sortAndFilterProfiles(
      profiles,
      settings.sortMode,
      settings.genreFilter,
      settings.statusFilter,
      running
    )
    // Search narrows what the filters and sort already produced, rather than
    // being another filter dropdown — typing is how people find one known game.
    return search.trim() ? list.filter((p) => matchesSearch(p, search)) : list
  }, [profiles, settings, running, search])

  // Stable references, so the memo() on the tiles has something to compare.
  const handleOpen = useCallback((name: string) => setLibraryFocus(name), [setLibraryFocus])
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, name: string) => openContextMenu(e.clientX, e.clientY, name),
    [openContextMenu]
  )

  const total = Object.keys(profiles).length

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-end gap-3 border-b border-card/60 px-5 py-3">
        <Field label={t('label_view')}>
          <div className="flex overflow-hidden rounded bg-card">
            {(['grid', 'list'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => void updateSettings({ libraryView: mode })}
                className={`px-3 py-1 text-xs transition-colors ${
                  view === mode ? 'bg-accent text-bg' : 'text-subtext hover:text-text'
                }`}
              >
                {t(mode === 'grid' ? 'view_grid' : 'view_list')}
              </button>
            ))}
          </div>
        </Field>

        <Field label={t('label_sort')}>
          <select
            className="rounded bg-card px-2 py-1 text-xs text-text outline-none"
            value={sortMode}
            onChange={(e) => void updateSettings({ sortMode: e.target.value as SortMode })}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.labelKey)}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t('label_status')}>
          <select
            className="rounded bg-card px-2 py-1 text-xs text-text outline-none"
            value={settings?.statusFilter ?? 'All'}
            onChange={(e) => void updateSettings({ statusFilter: e.target.value as 'All' | Status })}
          >
            <option value="All">{t('filter_all')}</option>
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t('label_genre')}>
          <select
            className="rounded bg-card px-2 py-1 text-xs text-text outline-none"
            value={settings?.genreFilter ?? 'All'}
            onChange={(e) => void updateSettings({ genreFilter: e.target.value })}
          >
            <option value="All">{t('filter_all')}</option>
            {GENRE_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {t(g, { ns: 'genres' })}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t('label_search')}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('placeholder_search_games')}
            className="w-44 rounded bg-card px-2 py-1 text-xs text-text outline-none ring-1 ring-transparent focus:ring-accent"
          />
        </Field>

        <div className="ml-auto flex items-end gap-2">
          <button
            onClick={() => openDialog('add')}
            className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-bg transition-opacity hover:opacity-90"
          >
            {t('btn_add_game')}
          </button>
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
        onContextMenu={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault()
            openContextMenu(e.clientX, e.clientY, null)
          }
        }}
      >
        {total === 0 ? (
          <div className="grid h-full place-items-center text-center text-sm text-subtext">
            <div className="flex flex-col items-center gap-3">
              <div>{t('empty_no_games')}</div>
              <button
                onClick={() => openDialog('add')}
                className="rounded bg-accent px-4 py-2 text-xs font-medium text-bg"
              >
                {t('btn_add_game')}
              </button>
            </div>
          </div>
        ) : sorted.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-subtext">{t('empty_filtered')}</div>
        ) : view === 'grid' ? (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
          >
            {sorted.map((p) => (
              <GameTile
                key={p.name}
                profile={p}
                onOpen={handleOpen}
                onContextMenu={handleContextMenu}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {sorted.map((p) => (
              <GameListRow
                key={p.name}
                profile={p}
                statusLabel={STATUS_LABEL[p.status]}
                iconSize={settings?.iconSize ?? 36}
                onOpen={handleOpen}
                onContextMenu={handleContextMenu}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
