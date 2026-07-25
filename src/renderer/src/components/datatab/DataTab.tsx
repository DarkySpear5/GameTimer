import { useMemo } from 'react'
import { useProfilesStore } from '../../state/profilesStore'
import { formatSeconds } from '@shared/format'
import type { Status } from '@shared/types'

const STATUS_LABELS: Record<Status, string> = {
  in_progress: 'In Progress',
  completed: 'Completed',
  dropped: 'Dropped',
  on_hold: 'On Hold'
}

export function DataTab(): React.JSX.Element {
  const profiles = useProfilesStore((s) => s.profiles)
  const list = useMemo(() => Object.values(profiles).sort((a, b) => a.name.localeCompare(b.name)), [profiles])

  const totalSeconds = list.reduce((sum, p) => sum + p.seconds, 0)
  const completedCount = list.filter((p) => p.status === 'completed').length

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="mb-5 text-lg font-semibold text-text">Your Stats</div>
      <div className="mb-5 flex gap-4">
        <StatCard label="Total Time Played" value={formatSeconds(totalSeconds)} />
        <StatCard label="Games Tracked" value={String(list.length)} />
        <StatCard label="Games Completed" value={String(completedCount)} />
      </div>
      <div className="overflow-x-auto rounded-lg bg-panel">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-card text-xs text-subtext">
              <th className="px-3 py-2 font-medium">Game</th>
              <th className="px-3 py-2 font-medium">Time Played</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Started</th>
              <th className="px-3 py-2 font-medium">Completed On</th>
              <th className="px-3 py-2 font-medium">Time Completed</th>
              <th className="px-3 py-2 font-medium">Rating</th>
              <th className="px-3 py-2 font-medium">Genres</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p, i) => {
              const isCompleted = p.status === 'completed'
              return (
                <tr key={p.name} className={i % 2 === 0 ? 'bg-panel' : 'bg-card/40'}>
                  <td className="px-3 py-2 text-text">{p.name}</td>
                  <td className="px-3 py-2 text-text">{formatSeconds(p.seconds)}</td>
                  <td className="px-3 py-2 text-text">{STATUS_LABELS[p.status]}</td>
                  <td className="px-3 py-2 text-subtext">{p.startedDate ?? '—'}</td>
                  <td className="px-3 py-2 text-subtext">{isCompleted ? (p.statusAt ?? '—') : '—'}</td>
                  <td className="px-3 py-2 text-subtext">
                    {isCompleted && p.statusSeconds != null ? formatSeconds(p.statusSeconds) : '—'}
                  </td>
                  <td className="px-3 py-2 text-gold">{p.rating > 0 ? '★'.repeat(p.rating) : '—'}</td>
                  <td className="px-3 py-2 text-subtext">{p.genres.join(', ')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {list.length === 0 && <div className="p-6 text-center text-sm text-subtext">No games yet</div>}
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
