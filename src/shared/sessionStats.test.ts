import { describe, expect, it } from 'vitest'
import { makeSessionEntry, summarizeSessions } from './sessionStats'

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

describe('summarizeSessions', () => {
  it('returns zeroes for an empty log', () => {
    expect(summarizeSessions([])).toEqual({
      sessions: 0,
      averageSeconds: 0,
      longestSeconds: 0,
      firstPlayedAt: null,
      lastPlayedAt: null
    })
  })

  it('counts and averages only real sessions', () => {
    const log = [
      { startedAt: HOUR, seconds: 100 },
      { startedAt: 2 * HOUR, seconds: 300 },
      { startedAt: 3 * HOUR, seconds: 20, short: true as const }
    ]
    const s = summarizeSessions(log)
    expect(s.sessions).toBe(2)
    expect(s.averageSeconds).toBe(200)
    expect(s.longestSeconds).toBe(300)
  })

  it('reports zero average rather than dividing by zero when every session was short', () => {
    const s = summarizeSessions([{ startedAt: HOUR, seconds: 5, short: true as const }])
    expect(s.sessions).toBe(0)
    expect(s.averageSeconds).toBe(0)
    expect(s.longestSeconds).toBe(0)
  })

  it('still reports first/last played from short sessions', () => {
    const s = summarizeSessions([{ startedAt: HOUR, seconds: 5, short: true as const }])
    expect(s.firstPlayedAt).toBe(HOUR)
    expect(s.lastPlayedAt).toBe(HOUR)
  })

  it('finds first and last regardless of log order', () => {
    const s = summarizeSessions([
      { startedAt: 3 * HOUR, seconds: 100 },
      { startedAt: 1 * HOUR, seconds: 100 },
      { startedAt: 2 * HOUR, seconds: 100 }
    ])
    expect(s.firstPlayedAt).toBe(1 * HOUR)
    expect(s.lastPlayedAt).toBe(3 * HOUR)
  })
})
