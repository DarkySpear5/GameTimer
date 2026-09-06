import { describe, expect, it } from 'vitest'
import { parseAppData } from './schema'
import { migratePlayHistory, migrateSessionAggregates } from './migrateSessions'

describe('migratePlayHistory', () => {
  it('creates one baseline from Started On without changing the canonical total', () => {
    const data = parseAppData({
      profiles: { Doom: { name: 'Doom', seconds: 3_600, startedDate: '2021-04-05' } }
    })

    expect(migratePlayHistory(data, '2026-09-05')).toBe(true)
    expect(data.profiles.Doom.seconds).toBe(3_600)
    expect(data.profiles.Doom.playHistory).toEqual({
      version: 1,
      baseline: { date: '2021-04-05', seconds: 3_600 },
      dailySeconds: {}
    })
  })

  it('uses the first played local date when Started On is unavailable', () => {
    const firstPlayedAt = new Date(2024, 6, 8, 9, 30).getTime()
    const data = parseAppData({
      profiles: { Doom: { name: 'Doom', seconds: 42, sessionStats: { firstPlayedAt } } }
    })

    migratePlayHistory(data, '2026-09-05')

    expect(data.profiles.Doom.playHistory?.baseline).toEqual({ date: '2024-07-08', seconds: 42 })
  })

  it('uses the migration date when no played date exists', () => {
    const data = parseAppData({ profiles: { Doom: { name: 'Doom', seconds: 42 } } })

    migratePlayHistory(data, '2026-09-05')

    expect(data.profiles.Doom.playHistory?.baseline).toEqual({ date: '2026-09-05', seconds: 42 })
  })

  it('does not replace an existing recorded ledger', () => {
    const data = parseAppData({
      profiles: {
        Doom: {
          name: 'Doom',
          seconds: 42,
          playHistory: { version: 1, baseline: null, dailySeconds: { '2026-09-04': 42 } }
        }
      }
    })

    expect(migratePlayHistory(data, '2026-09-05')).toBe(false)
    expect(data.profiles.Doom.playHistory?.dailySeconds).toEqual({ '2026-09-04': 42 })
  })

  it('installs the legacy baseline before recovering a crashed session', () => {
    const startedAt = new Date(2024, 6, 8, 9, 30).getTime()
    const data = parseAppData({
      profiles: {
        Doom: {
          name: 'Doom',
          seconds: 1_180,
          startedDate: '2021-04-05',
          activeSession: { startedAt, lastSeenAt: startedAt + 1_080_000 }
        }
      }
    })

    migrateSessionAggregates(data)

    expect(data.profiles.Doom.playHistory).toEqual({
      version: 1,
      baseline: { date: '2021-04-05', seconds: 1_180 },
      dailySeconds: {}
    })
  })
})
