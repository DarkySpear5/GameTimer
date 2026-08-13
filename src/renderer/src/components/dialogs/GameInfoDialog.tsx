import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../common/Modal'
import { useProfilesStore } from '../../state/profilesStore'
import { useSettingsStore } from '../../state/settingsStore'
import { summaryFrom } from '@shared/sessionStats'
import { formatSeconds } from '@shared/format'
import { toast } from '../common/Toast'

/**
 * Read-only, except for the one destructive action at the bottom.
 *
 * Every figure comes from the profile's running sessionStats aggregate, never
 * from sessionLog — the log holds only the most recent entries, so recomputing
 * from it would under-report any game with real history behind it.
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
  const advanced = useSettingsStore((s) => s.settings?.detailLevel === 'advanced')
  const watching = useSettingsStore((s) => s.settings?.watchForGames ?? false)
  // Read from the running aggregate, not the log — the log is a bounded
  // tail, so recomputing from it would under-report a long-played game.
  const summary = useMemo(
    () => summaryFrom(profile?.sessionStats ?? { count: 0, totalSeconds: 0, longestSeconds: 0, firstPlayedAt: null, lastPlayedAt: null }),
    [profile?.sessionStats]
  )

  if (!profile) return null

  const isCompleted = profile.status === 'completed'
  const hasRecord = profile.statusAt != null || profile.statusSeconds != null
  const idleSeconds = Math.max(0, profile.openSeconds - profile.seconds)
  const idlePercent = profile.openSeconds > 0 ? Math.round((idleSeconds / profile.openSeconds) * 100) : 0

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
        {isCompleted && (
          <Row
            label={t('col_time_to_beat')}
            value={profile.statusSeconds != null ? formatSeconds(profile.statusSeconds) : '—'}
          />
        )}
        {/*
         * Everything below needs context to read correctly — a launch count
         * means little without knowing launches aren't sessions, and the dates
         * are reference data rather than something you came here to learn. In
         * Simple they are simply absent.
         */}
        {advanced && (
          <>
            <Row
              label={t('stat_longest_session')}
              value={summary.sessions > 0 ? formatSeconds(summary.longestSeconds) : '—'}
            />
            <Row label={t('stat_launches')} value={String(profile.launches)} />
            <Row label={t('stat_first_played')} value={formatDate(summary.firstPlayedAt)} />
            <Row label={t('stat_last_played')} value={formatDate(summary.lastPlayedAt)} />
          </>
        )}
        {isCompleted && <Row label={t('col_completed_on')} value={profile.statusAt ?? '—'} />}
      </dl>

      {/*
       * Only ever shown here, only ever below Played, and always beside the
       * idle figure that explains the gap. Without that line a reader sees two
       * competing playtimes; with it they see "Steam would have said 50 — here
       * is where the other 31 went".
       */}
      {/*
       * Shown whenever Advanced is on, even with nothing to report. Hiding the
       * block on openSeconds === 0 meant a reader who turned Advanced on
       * specifically to see idle time got no idle row and no reason why — it
       * read as broken rather than as "nothing has been measured yet".
       */}
      {advanced && (
        <div className="mt-4 border-t border-card pt-4">
          {profile.openSeconds === 0 ? (
            <div className="text-xs leading-snug text-subtext">
              {watching ? t('note_idle_none_yet') : t('note_idle_needs_watching')}
            </div>
          ) : (
            <>
          <dl className="space-y-2 text-sm">
            <Row label={t('stat_open')} value={formatSeconds(profile.openSeconds)} />
            <Row
              label={t('stat_idle')}
              value={`${formatSeconds(idleSeconds)} (${idlePercent}%)`}
            />
          </dl>
          {/*
           * One line, not two. Tracked and idle always sum to 100, so a second
           * row would add height without adding information — and putting them
           * side by side is what makes the relationship legible at a glance.
           */}
          <div className="mt-2 text-xs text-subtext">
            {t('stat_tracked_idle_split', { tracked: 100 - idlePercent, idle: idlePercent })}
          </div>
          {/*
           * The first reaction to this block is "what is that, and how did it
           * happen?" — so it says so, rather than leaving two unexplained
           * durations to be reverse-engineered. Also names the caveat: the
           * watcher only samples every few seconds, so on a very short session
           * most of the gap is that sampling rather than real idle time.
           */}
          <div className="mt-2 text-xs leading-snug text-subtext">{t('note_idle_explained')}</div>
            </>
          )}
        </div>
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
