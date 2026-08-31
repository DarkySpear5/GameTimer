import { useTranslation } from 'react-i18next'
import { Modal } from '../common/Modal'
import { useProfilesStore } from '../../state/profilesStore'
import { useTimeFormat } from '../../state/useTimeFormat'
import { formatSeconds } from '@shared/format'

function Bar({ label, seconds, percent }: { label: string; seconds: number; percent: number }): React.JSX.Element {
  const timeFormat = useTimeFormat()
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm text-text">
        <span>{label}</span>
        <span className="tabular-nums text-subtext">
          {formatSeconds(seconds, timeFormat)} ({percent}%)
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-card">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${Math.max(percent > 0 ? 2 : 0, percent)}%` }}
        />
      </div>
    </div>
  )
}

export function ProfileStatsPerGameDialog({
  name,
  onClose
}: {
  name: string
  onClose: () => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const profile = useProfilesStore((s) => s.profiles[name])

  if (!profile) return null

  const total = profile.seconds
  const categorized = profile.subCategories.reduce((sum, c) => sum + c.seconds, 0)
  const untagged = Math.max(0, total - categorized)
  const pct = (s: number): number => (total > 0 ? Math.round((s / total) * 100) : 0)

  return (
    <Modal title={t('profile_stats_per_game_title', { name })} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {profile.subCategories.map((c) => (
          <Bar key={c.id} label={c.name} seconds={c.seconds} percent={pct(c.seconds)} />
        ))}
        <Bar label={t('profile_stats_per_game_untagged')} seconds={untagged} percent={pct(untagged)} />
      </div>
    </Modal>
  )
}
