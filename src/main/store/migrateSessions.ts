import { aggregateFrom, trimSessionLog } from '@shared/sessionStats'
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
  }
  return changed
}
