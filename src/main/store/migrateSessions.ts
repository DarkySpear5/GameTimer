import { aggregateFrom, trimSessionLog } from '@shared/sessionStats'
import { recoverSession } from '@shared/recoverSession'
import type { AppData } from '@shared/types'

/**
 * One-time fold of a full session log into its aggregate.
 *
 * Earlier builds kept every session forever and derived the stats from the
 * entries. That cost ~47MB of process memory and a multi-megabyte save file
 * being re-serialised on every 5-second checkpoint. The aggregate now holds
 * the totals and the log is bounded — but existing saves have to be converted
 * without losing the history those numbers describe.
 *
 * Detected by `firstPlayedAt === null` on a non-empty log: any session at all,
 * however short, sets that field, so it can only be null on a log that has
 * never been folded in.
 */
export function migrateSessionAggregates(data: AppData): boolean {
  let changed = false
  for (const profile of Object.values(data.profiles)) {
    const needsFold = profile.sessionStats.firstPlayedAt === null && profile.sessionLog.length > 0
    if (needsFold) {
      profile.sessionStats = aggregateFrom(profile.sessionLog)
      changed = true
    }
    const trimmed = trimSessionLog(profile.sessionLog)
    if (trimmed !== profile.sessionLog) {
      profile.sessionLog = trimmed
      changed = true
    }
    // A session marker still set at load time means the last run never paused
    // — a crash, a power cut, or a force-quit. Its time was already committed
    // to `seconds` by the checkpoint; this is what stops the session itself
    // from being lost, which is what made totals and averages disagree.
    if (recoverSession(profile)) changed = true
  }
  return changed
}
