import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProfilesStore } from '../../state/profilesStore'
import { useSettingsStore } from '../../state/settingsStore'
import { useUiStore, type DataSort, type DataSortKey } from '../../state/uiStore'
import { ContextMenu } from '../common/ContextMenu'
import { formatSeconds } from '@shared/format'
import type { Profile, Status } from '@shared/types'

/**
 * Which way a column sorts on its FIRST click. Ascending is only the useful
 * default for text — what you actually want to see first from a date, a
 * playtime or a rating is the most recent / longest / best one, so those
 * start descending and the second click flips them to oldest / shortest /
 * worst.
 */
const FIRST_CLICK_DIR: Record<DataSortKey, DataSort['dir']> = {
  name: 'asc',
  seconds: 'desc',
  status: 'asc',
  startedDate: 'desc',
  completedOn: 'desc',
  completedTime: 'desc',
  rating: 'desc'
}

/**
 * The value a row is ordered by, or null for the ones rendered as "—" —
 * those have nothing to compare, so they're pinned to the bottom in both
 * directions instead of taking over the top half whenever the sort is
 * reversed. Dates are stored ISO (YYYY-MM-DD), so ordering them as plain
 * strings is already chronological.
 */
function sortValue(p: Profile, key: DataSortKey, statusLabel: string): string | number | null {
  switch (key) {
    case 'name':
      return p.name
    case 'seconds':
      return p.seconds
    case 'status':
      // The translated label, not the raw enum, so the order matches what's
      // actually on screen in whatever language the app is running in.
      return statusLabel
    case 'startedDate':
      return p.startedDate
    case 'completedOn':
      return p.status === 'completed' ? p.statusAt : null
    case 'completedTime':
      return p.status === 'completed' ? p.statusSeconds : null
    case 'rating':
      return p.rating > 0 ? p.rating : null
  }
}

export function DataTab(): React.JSX.Element {
  const { t } = useTranslation()
  const profiles = useProfilesStore((s) => s.profiles)
  const sort = useUiStore((s) => s.dataSort)
  const setDataSort = useUiStore((s) => s.setDataSort)
  const openDialog = useUiStore((s) => s.openDialog)
  const scale = useSettingsStore((s) => s.settings?.dataTableScale ?? 1.15)
  // Its own menu rather than the sidebar's shared one: the actions that make
  // sense on a table row are a subset, and reusing that state would fight the
  // sidebar's selection.
  const [menu, setMenu] = useState<{ x: number; y: number; name: string } | null>(null)

  const STATUS_LABELS = useMemo<Record<Status, string>>(
    () => ({
      in_progress: t('status_in_progress'),
      completed: t('status_completed'),
      dropped: t('status_dropped'),
      on_hold: t('status_on_hold')
    }),
    [t]
  )

  const list = useMemo(() => {
    const flip = sort.dir === 'asc' ? 1 : -1
    return Object.values(profiles).sort((a, b) => {
      const av = sortValue(a, sort.key, STATUS_LABELS[a.status])
      const bv = sortValue(b, sort.key, STATUS_LABELS[b.status])
      if (av === null || bv === null) {
        if (av === bv) return a.name.localeCompare(b.name)
        return av === null ? 1 : -1
      }
      const cmp =
        typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      // Name is the tie-break everywhere, so equal ratings/statuses/times
      // still come out in a stable, readable order rather than whatever
      // order the profiles happened to be stored in.
      return cmp !== 0 ? cmp * flip : a.name.localeCompare(b.name)
    })
  }, [profiles, sort, STATUS_LABELS])

  function handleSort(key: DataSortKey): void {
    setDataSort(
      sort.key === key
        ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: FIRST_CLICK_DIR[key] }
    )
  }

  const totalSeconds = list.reduce((sum, p) => sum + p.seconds, 0)
  const completedCount = list.filter((p) => p.status === 'completed').length

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5" style={{ zoom: scale }}>
      <div className="mb-5 text-lg font-semibold text-text">{t('stats_title')}</div>
      <div className="mb-5 flex gap-4">
        <StatCard label={t('stat_total_time')} value={formatSeconds(totalSeconds)} />
        <StatCard label={t('stat_games_tracked')} value={String(list.length)} />
        <StatCard label={t('stat_games_completed')} value={String(completedCount)} />
      </div>
      <div className="overflow-x-auto rounded-lg bg-panel">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-card text-xs text-subtext">
              <SortHeader label={t('col_game')} sortKey="name" sort={sort} onSort={handleSort} />
              <SortHeader label={t('col_time_played')} sortKey="seconds" sort={sort} onSort={handleSort} />
              <SortHeader label={t('col_status')} sortKey="status" sort={sort} onSort={handleSort} />
              <SortHeader label={t('col_started')} sortKey="startedDate" sort={sort} onSort={handleSort} />
              <SortHeader label={t('col_completed_on')} sortKey="completedOn" sort={sort} onSort={handleSort} />
              <SortHeader
                label={t('col_completed_time')}
                sortKey="completedTime"
                sort={sort}
                onSort={handleSort}
              />
              <SortHeader label={t('col_rating')} sortKey="rating" sort={sort} onSort={handleSort} />
              {/* Genres stays plain — a game carries several at once, so there's no one value to order rows by. */}
              <th className="px-3 py-2 font-medium">{t('col_genres')}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p, i) => {
              const isCompleted = p.status === 'completed'
              return (
                <tr
                  key={p.name}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setMenu({ x: e.clientX, y: e.clientY, name: p.name })
                  }}
                  className={`cursor-context-menu ${i % 2 === 0 ? 'bg-panel' : 'bg-card/40'}`}
                >
                  <td className="px-3 py-2 text-text">
                    <div className="flex items-center gap-2">
                      {p.iconFile ? (
                        <img
                          src={`gt-asset://icons/${encodeURIComponent(p.iconFile)}`}
                          className="h-6 w-6 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <span className="h-6 w-6 shrink-0 rounded bg-card" />
                      )}
                      {p.name}
                    </div>
                  </td>
                  {/*
                   * Dates, durations and status labels are single values that
                   * read as nonsense broken in half ("2026-" / "08-07"), and
                   * at a high font scale the columns do get that tight. The
                   * wrapper is already overflow-x-auto, so keeping them whole
                   * scrolls the table instead of mangling them. Only Game and
                   * Genres — the two genuinely long, multi-word columns — are
                   * left free to wrap.
                   */}
                  <td className="px-3 py-2 whitespace-nowrap text-text">{formatSeconds(p.seconds)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-text">{STATUS_LABELS[p.status]}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-subtext">{p.startedDate ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-subtext">
                    {isCompleted ? (p.statusAt ?? '—') : '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-subtext">
                    {isCompleted && p.statusSeconds != null ? formatSeconds(p.statusSeconds) : '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gold">
                    {p.rating > 0 ? '★'.repeat(p.rating) : '—'}
                  </td>
                  <td className="px-3 py-2 text-subtext">
                    {p.genres.map((g) => t(g, { ns: 'genres' })).join(', ')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {list.length === 0 && <div className="p-6 text-center text-sm text-subtext">{t('empty_no_games')}</div>}
      </div>

      {/* Right-clicking is invisible until someone tries it, and nobody tries it. */}
      {list.length > 0 && <div className="mt-2 text-xs text-subtext">{t('hint_right_click')}</div>}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: t('ctx_info'), onClick: () => openDialog('info', menu.name) },
            { label: t('ctx_modify'), onClick: () => openDialog('modify', menu.name) },
            { label: t('ctx_notes'), onClick: () => openDialog('notes', menu.name) }
          ]}
        />
      )}
    </div>
  )
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort
}: {
  label: string
  sortKey: DataSortKey
  sort: DataSort
  onSort: (key: DataSortKey) => void
}): React.JSX.Element {
  const active = sort.key === sortKey
  return (
    <th
      className="px-3 py-2 font-medium"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        onClick={() => onSort(sortKey)}
        className={`flex items-center gap-1 whitespace-nowrap transition-colors hover:text-accent ${
          active ? 'text-accent' : ''
        }`}
      >
        {label}
        {/*
         * The arrow stays in the DOM on inactive columns (just hidden) so
         * moving the sort from one column to another never nudges every
         * other header sideways.
         */}
        <span className={`text-[0.7em] ${active ? '' : 'invisible'}`}>
          {active && sort.dir === 'desc' ? '▼' : '▲'}
        </span>
      </button>
    </th>
  )
}

function StatCard({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex-1 rounded-lg bg-panel px-4 py-3">
      <div className="text-xs text-subtext">{label}</div>
      <div className="mt-1 text-xl font-semibold text-text">{value}</div>
    </div>
  )
}
