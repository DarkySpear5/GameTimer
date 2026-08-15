import { describe, expect, it } from 'vitest'
import {
  MAX_SESSION_LOG,
  addSession,
  aggregateFrom,
  emptyAggregate,
  hasIdleBaseline,
  idleSecondsFor,
  makeSessionEntry,
  summaryFrom,
  trimSessionLog
} from './sessionStats'

const HOUR = 3_600_000

describe('makeSessionEntry', () => {
  it('records elapsed wall-clock seconds', () => {
    expect(makeSessionEntry(1000, 1000 + 90_000)).toEqual({ startedAt: 1000, seconds: 90 })
  })

  it('flags a sub-60s session as short', () => {
    expect(makeSessionEntry(1000, 1000 + 30_000)).toEqual({ startedAt: 1000, seconds: 30, short: true })
  })

  it('treats exactly 60s as a real session', () => {
    expect(makeSessionEntry(1000, 1000 + 60_000).short).toBeUndefined()
  })

  it('never produces negative seconds if the clock jumps backwards', () => {
    expect(makeSessionEntry(5000, 1000).seconds).toBe(0)
  })
})

describe('addSession', () => {
  it('accumulates count, total and longest', () => {
    let a = emptyAggregate()
    a = addSession(a, { startedAt: HOUR, seconds: 100 })
    a = addSession(a, { startedAt: 2 * HOUR, seconds: 300 })
    expect(a).toEqual({
      count: 2,
      totalSeconds: 400,
      longestSeconds: 300,
      firstPlayedAt: HOUR,
      lastPlayedAt: 2 * HOUR
    })
  })

  it('excludes short sessions from the counted figures but not from first/last', () => {
    const a = addSession(emptyAggregate(), { startedAt: HOUR, seconds: 20, short: true })
    expect(a.count).toBe(0)
    expect(a.totalSeconds).toBe(0)
    expect(a.longestSeconds).toBe(0)
    expect(a.firstPlayedAt).toBe(HOUR)
    expect(a.lastPlayedAt).toBe(HOUR)
  })

  it('tracks first/last regardless of the order sessions arrive in', () => {
    let a = emptyAggregate()
    a = addSession(a, { startedAt: 3 * HOUR, seconds: 100 })
    a = addSession(a, { startedAt: 1 * HOUR, seconds: 100 })
    expect(a.firstPlayedAt).toBe(1 * HOUR)
    expect(a.lastPlayedAt).toBe(3 * HOUR)
  })

  it('does not mutate the aggregate it was given', () => {
    const a = emptyAggregate()
    addSession(a, { startedAt: HOUR, seconds: 100 })
    expect(a).toEqual(emptyAggregate())
  })
})

describe('summaryFrom', () => {
  it('reports zeroes for a game never played', () => {
    expect(summaryFrom(emptyAggregate())).toEqual({
      sessions: 0,
      averageSeconds: 0,
      longestSeconds: 0,
      firstPlayedAt: null,
      lastPlayedAt: null
    })
  })

  it('averages only real sessions', () => {
    const a = aggregateFrom([
      { startedAt: HOUR, seconds: 100 },
      { startedAt: 2 * HOUR, seconds: 300 },
      { startedAt: 3 * HOUR, seconds: 20, short: true }
    ])
    expect(summaryFrom(a)).toMatchObject({ sessions: 2, averageSeconds: 200, longestSeconds: 300 })
  })

  it('reports zero average rather than dividing by zero', () => {
    const a = aggregateFrom([{ startedAt: HOUR, seconds: 5, short: true }])
    expect(summaryFrom(a).averageSeconds).toBe(0)
  })
})

describe('hasIdleBaseline', () => {
  it('is false when neither baseline has ever been captured', () => {
    expect(
      hasIdleBaseline({ secondsAtOpenTrackingStart: null, openSecondsAtOpenTrackingStart: null })
    ).toBe(false)
  })

  // The exact shape of the second reported bug: a profile can already have
  // one baseline field set (from the first version of this fix) without the
  // other (added in the second version) — a half-migrated state that must
  // still read as "no data", not silently treated as complete.
  it('is false when only one side of the pair is set', () => {
    expect(
      hasIdleBaseline({ secondsAtOpenTrackingStart: 100, openSecondsAtOpenTrackingStart: null })
    ).toBe(false)
    expect(
      hasIdleBaseline({ secondsAtOpenTrackingStart: null, openSecondsAtOpenTrackingStart: 100 })
    ).toBe(false)
  })

  it('is true once both sides are set', () => {
    expect(
      hasIdleBaseline({ secondsAtOpenTrackingStart: 100, openSecondsAtOpenTrackingStart: 50 })
    ).toBe(true)
  })
})

describe('idleSecondsFor', () => {
  it('is 0 with no baseline at all, however large openSeconds already is', () => {
    expect(
      idleSecondsFor({
        seconds: 100,
        openSeconds: 5_000,
        secondsAtOpenTrackingStart: null,
        openSecondsAtOpenTrackingStart: null
      })
    ).toBe(0)
  })

  // The FIRST bug this whole feature had: naive `openSeconds - seconds`
  // compared openSeconds against the profile's ENTIRE seconds total, so
  // huge pre-tracking history clamped idle to 0 forever.
  it('is not swallowed by huge pre-tracking history once both baselines exist', () => {
    const secondsAtStart = 52_441 // 14:34:01, matches the real report
    const idle = idleSecondsFor({
      seconds: secondsAtStart + 300, // +5 min played since the baseline
      openSeconds: 1_200, // 20 min of open time accrued since the baseline
      secondsAtOpenTrackingStart: secondsAtStart,
      openSecondsAtOpenTrackingStart: 0
    })
    expect(idle).toBe(900) // the 15 real idle minutes, not 0
  })

  // The SECOND bug — found only after the first fix shipped and got tested
  // live: with only a `seconds` baseline and no matching `openSeconds` one,
  // any OLD openSeconds sitting on the profile (from before this pairing
  // existed) had nothing to net it against, so ALL of it read as idle next
  // to real hours of active play. Reported live: 9:25:18 played, 13:44:10
  // open, shown as 13:44:10 (100%) idle. Both baselines fixes this: old,
  // un-split openSeconds is excluded by the openSeconds-side baseline too,
  // not dumped onto the idle side by default.
  it('does not read old openSeconds as 100% idle once both baselines exist', () => {
    const idle = idleSecondsFor({
      seconds: 33_918, // 9:25:18 total played
      openSeconds: 49_450, // 13:44:10 total open
      // Baseline captured with SOME real play already behind it, matching
      // the real report's shape — the point is openSeconds has its own
      // baseline now too, not that these particular numbers are exact.
      secondsAtOpenTrackingStart: 30_000,
      openSecondsAtOpenTrackingStart: 45_000
    })
    // Since the baseline: seconds grew by 3918s, openSeconds grew by 4450s.
    expect(idle).toBe(532) // 4450 - 3918, not 49450 (100%)
  })

  it('nets out cleanly for a profile that was always tracked from zero', () => {
    const idle = idleSecondsFor({
      seconds: 400,
      openSeconds: 1_000,
      secondsAtOpenTrackingStart: 0,
      openSecondsAtOpenTrackingStart: 0
    })
    expect(idle).toBe(600)
  })

  it('never goes negative even if active time somehow exceeds open time', () => {
    const idle = idleSecondsFor({
      seconds: 1_000,
      openSeconds: 100,
      secondsAtOpenTrackingStart: 0,
      openSecondsAtOpenTrackingStart: 0
    })
    expect(idle).toBe(0)
  })
})

describe('trimSessionLog with aggregateFrom', () => {
  it('keeps every figure exact after the log has been trimmed away', () => {
    // The whole point of the split: 5000 sessions, only 200 entries retained,
    // and every displayed figure still describes all 5000.
    const log = Array.from({ length: 5000 }, (_, i) => ({ startedAt: HOUR * i, seconds: 60 + i }))
    const agg = aggregateFrom(log)
    const trimmed = trimSessionLog(log)

    expect(trimmed).toHaveLength(MAX_SESSION_LOG)
    expect(summaryFrom(agg)).toMatchObject({
      sessions: 5000,
      longestSeconds: 60 + 4999,
      firstPlayedAt: 0,
      lastPlayedAt: HOUR * 4999
    })
    // Recomputing from the trimmed log alone would claim only 200 sessions.
    expect(summaryFrom(aggregateFrom(trimmed)).sessions).toBe(MAX_SESSION_LOG)
  })

  it('leaves a short log untouched', () => {
    const log = [{ startedAt: HOUR, seconds: 100 }]
    expect(trimSessionLog(log)).toBe(log)
  })

  it('keeps the most recent entries, not the oldest', () => {
    const log = Array.from({ length: MAX_SESSION_LOG + 5 }, (_, i) => ({ startedAt: i, seconds: 100 }))
    const trimmed = trimSessionLog(log)
    expect(trimmed[trimmed.length - 1].startedAt).toBe(MAX_SESSION_LOG + 4)
  })
})
