import { MIN_SESSION_SECONDS } from './constants'

/**
 * One Play→Pause cycle. `startedAt` is a Date.now() epoch ms; `seconds` is
 * wall-clock elapsed. `short` marks a cycle below MIN_SESSION_SECONDS — kept
 * in the log (the data is real) but excluded from counts and averages.
 */
export interface SessionEntry {
  startedAt: number
  seconds: number
  short?: true
}

export interface SessionSummary {
  /** Real sessions only — short ones are excluded. */
  sessions: number
  /** Mean of real sessions. 0 when there are none, never NaN. */
  averageSeconds: number
  longestSeconds: number
  /** From the whole log including short sessions — you did open it, briefly. */
  firstPlayedAt: number | null
  lastPlayedAt: number | null
}

export function makeSessionEntry(startedAt: number, endedAt: number): SessionEntry {
  // Clamped at zero: a system clock adjustment mid-session could otherwise
  // write a negative duration into the log and corrupt every average forever.
  const seconds = Math.max(0, Math.floor((endedAt - startedAt) / 1000))
  return seconds < MIN_SESSION_SECONDS ? { startedAt, seconds, short: true } : { startedAt, seconds }
}

/**
 * Averages come from the log itself, never from `profile.seconds / count` —
 * `seconds` can be edited directly (addRemoveTime) or zeroed (resetTime), so
 * deriving from it would produce an average that contradicts the sessions
 * actually listed.
 */
export function summarizeSessions(log: SessionEntry[]): SessionSummary {
  let sessions = 0
  let totalSeconds = 0
  let longestSeconds = 0
  let firstPlayedAt: number | null = null
  let lastPlayedAt: number | null = null

  for (const entry of log) {
    if (firstPlayedAt === null || entry.startedAt < firstPlayedAt) firstPlayedAt = entry.startedAt
    if (lastPlayedAt === null || entry.startedAt > lastPlayedAt) lastPlayedAt = entry.startedAt
    if (entry.short) continue
    sessions++
    totalSeconds += entry.seconds
    if (entry.seconds > longestSeconds) longestSeconds = entry.seconds
  }

  return {
    sessions,
    averageSeconds: sessions === 0 ? 0 : Math.round(totalSeconds / sessions),
    longestSeconds,
    firstPlayedAt,
    lastPlayedAt
  }
}
