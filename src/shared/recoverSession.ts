import { addSession, makeSessionEntry, trimSessionLog } from './sessionStats'
import type { ActiveSession, SessionAggregate, SessionEntry } from './sessionStats'

/** Only the fields recovery touches, so tests don't have to build a whole Profile. */
export interface RecoverTarget {
  sessionStats: SessionAggregate
  sessionLog: SessionEntry[]
  activeSession: ActiveSession | null
}

/**
 * Folds a session that was still running when the app died into the permanent
 * totals.
 *
 * The session is credited from `startedAt` to `lastSeenAt` — NOT to now. The
 * gap between the crash and the next launch could be days, and the last
 * checkpoint is the newest moment the game is known to have actually been
 * played. Erring short is the honest direction: it matches the `seconds` that
 * were already committed by that same checkpoint, so the totals reconcile.
 *
 * Returns whether anything changed, so the caller only saves when it did.
 */
export function recoverSession(target: RecoverTarget): boolean {
  const active = target.activeSession
  if (!active) return false

  target.activeSession = null

  // A crash within the first checkpoint window has nothing durable to credit;
  // clearing the marker is the whole job.
  if (active.lastSeenAt <= active.startedAt) return true

  const entry = makeSessionEntry(active.startedAt, active.lastSeenAt)
  target.sessionStats = addSession(target.sessionStats, entry)
  target.sessionLog = trimSessionLog([...target.sessionLog, entry])
  return true
}
