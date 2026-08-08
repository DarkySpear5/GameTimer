import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../common/Modal'
import { useProfilesStore } from '../../state/profilesStore'
import { summarizeSessions } from '@shared/sessionStats'
import { formatSeconds } from '@shared/format'
import { toast } from '../common/Toast'

/**
 * Read-only, except for the one destructive action at the bottom. Everything
 * numeric is derived from sessionLog on render rather than stored, so nothing
 * here can disagree with the log it came from.
 */
export function GameInfoDialog({
  name,
  onClose
}: {
  name: string
  onClose: () => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const profile = useProfilesStore((s) => s.profiles[name])
  const summary = useMemo(() => summarizeSessions(profile?.sessionLog ?? []), [profile?.sessionLog])

  if (!profile) return null

  const isCompleted = profile.status === 'completed'
  const hasRecord = profile.statusAt != null || profile.statusSeconds != null

  async function handleClearRecord(): Promise<void> {
    if (!window.confirm(t('confirm_clear_completion_msg', { name }))) return
    try {
      useProfilesStore.getState().upsert(await window.api.profiles.clearStatusRecord(name))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Modal title={t('info_title')} onClose={onClose} width="max-w-sm">
      <div className="mb-4 text-base font-semibold text-text">{profile.name}</div>

      {/*
       * Played is deliberately the only playtime with visual weight. Stage 3
       * adds "Game was open" and "Idle" below this block, and they must read
       * as context for this number, never as rivals to it.
       */}
      <div className="mb-4 border-b border-card pb-4">
        <div className="text-xs text-subtext">{t('col_time_played')}</div>
        <div className="mt-0.5 text-2xl font-semibold tabular-nums text-text">
          {formatSeconds(profile.seconds)}
        </div>
      </div>

      <dl className="space-y-2 text-sm">
        <Row label={t('stat_sessions')} value={String(summary.sessions)} />
        <Row
          label={t('stat_avg_session')}
          value={summary.sessions > 0 ? formatSeconds(summary.averageSeconds) : '—'}
        />
        <Row
          label={t('stat_longest_session')}
          value={summary.sessions > 0 ? formatSeconds(summary.longestSeconds) : '—'}
        />
        <Row label={t('stat_launches')} value={String(profile.launches)} />
        <Row label={t('stat_first_played')} value={formatDate(summary.firstPlayedAt)} />
        <Row label={t('stat_last_played')} value={formatDate(summary.lastPlayedAt)} />
        {isCompleted && <Row label={t('col_completed_on')} value={profile.statusAt ?? '—'} />}
        {isCompleted && (
          <Row
            label={t('col_completed_time')}
            value={profile.statusSeconds != null ? formatSeconds(profile.statusSeconds) : '—'}
          />
        )}
      </dl>

      {/*
       * Only ever shown here, only ever below Played, and always beside the
       * idle figure that explains the gap. Without that line a reader sees two
       * competing playtimes; with it they see "Steam would have said 50 — here
       * is where the other 31 went".
       */}
      {profile.openSeconds > 0 && (
        <dl className="mt-4 space-y-2 border-t border-card pt-4 text-sm">
          <Row label={t('stat_open')} value={formatSeconds(profile.openSeconds)} />
          <Row
            label={t('stat_idle')}
            value={`${formatSeconds(Math.max(0, profile.openSeconds - profile.seconds))} (${Math.round(
              (Math.max(0, profile.openSeconds - profile.seconds) / profile.openSeconds) * 100
            )}%)`}
          />
        </dl>
      )}

      {hasRecord && (
        <button
          onClick={() => void handleClearRecord()}
          className="mt-5 w-full rounded bg-card py-2 text-xs text-red transition-opacity hover:opacity-80"
        >
          {t('btn_clear_completion')}
        </button>
      )}
    </Modal>
  )
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-subtext">{label}</dt>
      <dd className="tabular-nums text-text">{value}</dd>
    </div>
  )
}

/** Epoch ms -> the same YYYY-MM-DD shape the rest of the app stores dates in. */
function formatDate(ms: number | null): string {
  if (ms === null) return '—'
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
