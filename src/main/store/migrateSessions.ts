import { aggregateFrom, trimSessionLog } from '@shared/sessionStats'
import { baselinePlayHistory } from '@shared/playHistory'
import { recoverSession } from '@shared/recoverSession'
import type { AppData } from '@shared/types'
import { todayDateString } from '../util/date'

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
  // Run after old logs have supplied firstPlayedAt, but before crash recovery:
  // an old crash marker's checkpointed seconds belong in the truthful legacy
  // baseline, not in a fabricated single recorded day.
  if (migratePlayHistory(data)) changed = true
  for (const profile of Object.values(data.profiles)) {
    // A session marker still set at load time means the last run never paused
    // — a crash, a power cut, or a force-quit. Its time was already committed
    // to `seconds` by the checkpoint; this is what stops the session itself
    // from being lost, which is what made totals and averages disagree.
    if (recoverSession(profile)) changed = true
  }
  return changed
}

/**
 * Gives pre-ledger profiles one honest, labelled total instead of fabricating
 * historical daily activity. A non-empty ledger has already been migrated or
 * recorded and is intentionally left untouched.
 */
export function migratePlayHistory(data: AppData, migrationDate = todayDateString()): boolean {
  let changed = false
  for (const profile of Object.values(data.profiles)) {
    const history = profile.playHistory
    if (history?.baseline || (history && Object.keys(history.dailySeconds).length > 0)) continue

    profile.playHistory = baselinePlayHistory(
      profile.seconds,
      profile.startedDate,
      profile.sessionStats.firstPlayedAt,
      migrationDate
    )
    changed = true
  }
  return changed
}
