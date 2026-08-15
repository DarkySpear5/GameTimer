import { describe, expect, it } from 'vitest'
import {
  MAX_SESSION_LOG,
  addSession,
  aggregateFrom,
  emptyAggregate,
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

describe('idleSecondsFor', () => {
  it('is 0 for a profile openSeconds has never covered', () => {
    expect(idleSecondsFor({ seconds: 100, openSeconds: 0, secondsAtOpenTrackingStart: null })).toBe(0)
  })

  // The actual reported bug: a profile with real history from before idle
  // tracking existed (or from a Gamut version that predates it) has a large
  // `seconds` total and a small `openSeconds` one just starting to accrue.
  // The naive `openSeconds - seconds` clamps this to 0 forever; the fix
  // compares against only the `seconds` accrued since tracking started.
  it('is not swallowed by huge pre-tracking history once a baseline exists', () => {
    // 14.5 hours of history (matches the real report), then tracking starts:
    // openSeconds accrues 20 minutes of open time while only 5 minutes of
    // that was actively played (the rest is real idle time).
    const secondsAtStart = 52_441 // 14:34:01
    const idle = idleSecondsFor({
      seconds: secondsAtStart + 300, // +5 min played since tracking started
      openSeconds: 1_200, // 20 min game-open time accrued since tracking started
      secondsAtOpenTrackingStart: secondsAtStart
    })
    expect(idle).toBe(900) // the 15 real idle minutes, not 0
  })

  it('nets out cleanly for a profile that was always tracked from zero', () => {
    // No pre-existing history: baseline is 0, same as never having one.
    const idle = idleSecondsFor({ seconds: 400, openSeconds: 1_000, secondsAtOpenTrackingStart: 0 })
    expect(idle).toBe(600)
  })

  it('never goes negative even if active time somehow exceeds open time', () => {
    const idle = idleSecondsFor({ seconds: 1_000, openSeconds: 100, secondsAtOpenTrackingStart: 0 })
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
