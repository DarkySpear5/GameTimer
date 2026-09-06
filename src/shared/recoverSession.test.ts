import { describe, expect, it } from 'vitest'
import { recoverSession, type RecoverTarget } from './recoverSession'
import { emptyAggregate, summaryFrom } from './sessionStats'
import { MIN_SESSION_SECONDS } from './constants'
import { emptyPlayHistory } from './playHistory'

const MINUTE = 60_000
const T0 = 1_700_000_000_000

function target(active: RecoverTarget['activeSession']): RecoverTarget {
  return { sessionStats: emptyAggregate(), sessionLog: [], activeSession: active }
}

describe('recoverSession', () => {
  it('does nothing when the last run ended cleanly', () => {
    const t = target(null)
    expect(recoverSession(t)).toBe(false)
    expect(t.sessionStats.count).toBe(0)
  })

  // The reported bug: a PC crash 18 minutes into a session. The time was
  // already committed to `seconds` by the 5s checkpoint, but the session was
  // lost, so 2 real runs showed as 1 and "average" was really "the last run".
  it('recovers a session the app never got to pause', () => {
    const t = target({ startedAt: T0, lastSeenAt: T0 + 18 * MINUTE })
    expect(recoverSession(t)).toBe(true)
    expect(t.sessionStats.count).toBe(1)
    expect(t.sessionStats.totalSeconds).toBe(18 * 60)
    expect(t.activeSession).toBeNull()
  })

  it('makes the recovered session count toward the average', () => {
    const t = target({ startedAt: T0, lastSeenAt: T0 + 18 * MINUTE })
    // A clean 60-minute session already on record.
    t.sessionStats = { count: 1, totalSeconds: 3600, longestSeconds: 3600, firstPlayedAt: T0, lastPlayedAt: T0 }
    recoverSession(t)
    const summary = summaryFrom(t.sessionStats)
    expect(summary.sessions).toBe(2)
    // Before the fix this stayed 60:00 — the crashed run was invisible.
    expect(summary.averageSeconds).toBe((3600 + 18 * 60) / 2)
  })

  // Credited to the last checkpoint, never to now: the gap between a crash and
  // the next launch can be days, and only checkpointed time was durably saved.
  it('credits only up to the last checkpoint, not the time since', () => {
    const t = target({ startedAt: T0, lastSeenAt: T0 + 30 * MINUTE })
    recoverSession(t)
    expect(t.sessionStats.totalSeconds).toBe(30 * 60)
    expect(t.sessionStats.lastPlayedAt).toBe(T0)
  })

  it('clears a marker with nothing durable behind it without inventing a session', () => {
    // Crashed inside the first checkpoint window.
    const t = target({ startedAt: T0, lastSeenAt: T0 })
    expect(recoverSession(t)).toBe(true)
    expect(t.sessionStats.count).toBe(0)
    expect(t.sessionLog).toHaveLength(0)
    expect(t.activeSession).toBeNull()
  })

  it('marks a too-short recovered session short, so it does not skew the average', () => {
    const t = target({ startedAt: T0, lastSeenAt: T0 + (MIN_SESSION_SECONDS - 1) * 1000 })
    recoverSession(t)
    expect(t.sessionStats.count).toBe(0)
    expect(t.sessionLog[0].short).toBe(true)
    // It still counts as having opened the game.
    expect(t.sessionStats.firstPlayedAt).toBe(T0)
  })

  it('appends to existing history rather than replacing it', () => {
    const t = target({ startedAt: T0 + MINUTE, lastSeenAt: T0 + 20 * MINUTE })
    t.sessionLog = [{ startedAt: T0, seconds: 60 }]
    recoverSession(t)
    expect(t.sessionLog).toHaveLength(2)
    expect(t.sessionLog[0].startedAt).toBe(T0)
  })

  it('fills a recovered interval that is in the canonical total but absent from the daily ledger', () => {
    const t = {
      ...target({ startedAt: T0, lastSeenAt: T0 + 18 * MINUTE }),
      seconds: 18 * 60,
      playHistory: emptyPlayHistory()
    }

    recoverSession(t)

    expect(t.playHistory.dailySeconds).toEqual({ [localDate(T0)]: 18 * 60 })
  })
})

function localDate(time: number): string {
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
