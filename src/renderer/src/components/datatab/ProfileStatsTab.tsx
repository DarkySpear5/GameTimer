import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useProfilesStore } from '../../state/profilesStore'
import { useSettingsStore } from '../../state/settingsStore'
import { useTimeFormat } from '../../state/useTimeFormat'
import { formatSeconds } from '@shared/format'
import { idleSecondsFor } from '@shared/sessionStats'

/**
 * K1: the account-wide counterpart to Game Stats — "how am I spending my time
 * across everything I own", not "what does one game look like". Not Started
 * games are excluded, matching Game Stats (F1): they have zero of everything
 * this page measures, so including them would only add rows that read "0h".
 */
export function ProfileStatsTab(): React.JSX.Element {
  const { t } = useTranslation()
  const profiles = useProfilesStore((s) => s.profiles)
  const scale = useSettingsStore((s) => s.settings?.dataTableScale ?? 1.15)
  const watching = useSettingsStore((s) => s.settings?.watchForGames ?? false)
  const timeFormat = useTimeFormat()

  const { totalActive, totalIdle, genreHours, trackedGames } = useMemo(() => {
    const list = Object.values(profiles).filter((p) => p.status !== 'not_started')
    let active = 0
    let idle = 0
    const byGenre = new Map<string, number>()

    for (const p of list) {
      active += p.seconds
      // Same formula as the per-game figure in More Info — see idleSecondsFor's
      // own doc comment for why this isn't just `openSeconds - seconds`. A
      // game Gamut never watched still contributes 0 rather than reading as
      // negative idle time.
      idle += idleSecondsFor(p)
      // A game's full playtime counts toward EVERY genre it carries — the app
      // already treats genres as a non-exclusive tag set everywhere else
      // (Library filtering, the genre lock), so splitting time across a
      // multi-genre game would invent a precision the tagging never had.
      // Percentages below can and do sum past 100% for exactly this reason.
      for (const g of p.genres) byGenre.set(g, (byGenre.get(g) ?? 0) + p.seconds)
    }

    const genreHours = [...byGenre.entries()]
      .map(([genre, seconds]) => ({ genre, seconds }))
      .sort((a, b) => b.seconds - a.seconds)

    return { totalActive: active, totalIdle: idle, genreHours, trackedGames: list.length }
  }, [profiles])

  // The denominator is active+idle, not active alone — same relationship as
  // the per-game split in More Info (stat_tracked_idle_split), just summed.
  // Games Gamut never watched contribute 0 idle rather than skewing this, so
  // the percentage stays honest even on a library that's mostly unwatched.
  const knownTotal = totalActive + totalIdle
  const activePercent = knownTotal > 0 ? Math.round((totalActive / knownTotal) * 100) : null
  const idlePercent = activePercent === null ? null : 100 - activePercent
  const topGenreSeconds = genreHours[0]?.seconds ?? 0

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="px-6 py-5" style={{ zoom: scale }}>
        <div className="mb-5 text-lg font-semibold text-text">{t('tab_profile_stats')}</div>

        {trackedGames === 0 ? (
          <div className="rounded-lg bg-panel p-6 text-center text-sm text-subtext">
            {t('profile_stats_empty')}
          </div>
        ) : (
          <>
            <div className="mb-6 flex gap-4">
              <StatCard
                label={t('profile_stats_active_time')}
                value={formatSeconds(totalActive, timeFormat)}
                percent={activePercent}
              />
              <StatCard
                label={t('profile_stats_idle_time')}
                value={formatSeconds(totalIdle, timeFormat)}
                percent={idlePercent}
              />
            </div>
            {activePercent === null && (
              <div className="-mt-4 mb-6 text-xs leading-snug text-subtext">
                {watching ? t('note_idle_none_yet') : t('note_idle_needs_watching')}
              </div>
            )}

            <div className="rounded-lg bg-panel p-4">
              <div className="mb-3 text-sm font-semibold text-text">{t('profile_stats_hours_by_genre')}</div>
              {genreHours.length === 0 ? (
                <div className="py-2 text-sm text-subtext">{t('profile_stats_no_genre_data')}</div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {genreHours.map(({ genre, seconds }) => (
                    <GenreBar
                      key={genre}
                      label={t(genre, { ns: 'genres' })}
                      seconds={seconds}
                      percentOfActive={totalActive > 0 ? Math.round((seconds / totalActive) * 100) : 0}
                      barFraction={topGenreSeconds > 0 ? seconds / topGenreSeconds : 0}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  percent
}: {
  label: string
  value: string
  percent: number | null
}): React.JSX.Element {
  return (
    <div className="flex-1 rounded-lg bg-panel px-4 py-3">
      <div className="text-xs text-subtext">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-xl font-semibold text-text">{value}</span>
        {percent !== null && <span className="text-sm text-subtext">({percent}%)</span>}
      </div>
    </div>
  )
}

function GenreBar({
  label,
  seconds,
  percentOfActive,
  barFraction
}: {
  label: string
  seconds: number
  percentOfActive: number
  barFraction: number
}): React.JSX.Element {
  const timeFormat = useTimeFormat()
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-text">{label}</span>
        <span className="tabular-nums text-subtext">
          {formatSeconds(seconds, timeFormat)} ({percentOfActive}%)
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-card">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${Math.max(2, Math.round(barFraction * 100))}%` }}
        />
      </div>
    </div>
  )
}
