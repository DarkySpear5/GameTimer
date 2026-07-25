import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useProfilesStore } from '../../state/profilesStore'
import { formatSeconds } from '@shared/format'
import type { Status } from '@shared/types'

export function DataTab(): React.JSX.Element {
  const { t } = useTranslation()
  const profiles = useProfilesStore((s) => s.profiles)
  const list = useMemo(() => Object.values(profiles).sort((a, b) => a.name.localeCompare(b.name)), [profiles])

  const STATUS_LABELS: Record<Status, string> = {
    in_progress: t('status_in_progress'),
    completed: t('status_completed'),
    dropped: t('status_dropped'),
    on_hold: t('status_on_hold')
  }

  const totalSeconds = list.reduce((sum, p) => sum + p.seconds, 0)
  const completedCount = list.filter((p) => p.status === 'completed').length

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
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
              <th className="px-3 py-2 font-medium">{t('col_game')}</th>
              <th className="px-3 py-2 font-medium">{t('col_time_played')}</th>
              <th className="px-3 py-2 font-medium">{t('col_status')}</th>
              <th className="px-3 py-2 font-medium">{t('col_started')}</th>
              <th className="px-3 py-2 font-medium">{t('col_completed_on')}</th>
              <th className="px-3 py-2 font-medium">{t('col_completed_time')}</th>
              <th className="px-3 py-2 font-medium">{t('col_rating')}</th>
              <th className="px-3 py-2 font-medium">{t('col_genres')}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p, i) => {
              const isCompleted = p.status === 'completed'
              return (
                <tr key={p.name} className={i % 2 === 0 ? 'bg-panel' : 'bg-card/40'}>
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
                  <td className="px-3 py-2 text-text">{formatSeconds(p.seconds)}</td>
                  <td className="px-3 py-2 text-text">{STATUS_LABELS[p.status]}</td>
                  <td className="px-3 py-2 text-subtext">{p.startedDate ?? '—'}</td>
                  <td className="px-3 py-2 text-subtext">{isCompleted ? (p.statusAt ?? '—') : '—'}</td>
                  <td className="px-3 py-2 text-subtext">
                    {isCompleted && p.statusSeconds != null ? formatSeconds(p.statusSeconds) : '—'}
                  </td>
                  <td className="px-3 py-2 text-gold">{p.rating > 0 ? '★'.repeat(p.rating) : '—'}</td>
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
    </div>
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
