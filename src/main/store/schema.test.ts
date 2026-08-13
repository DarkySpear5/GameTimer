import { describe, expect, it } from 'vitest'
import { parseAppData, freshAppData } from './schema'

describe('sessionLog schema', () => {
  it('defaults to an empty array for a v2 profile that predates it', () => {
    const data = parseAppData({
      profiles: { Doom: { name: 'Doom', seconds: 10 } },
      lastSelected: null
    })
    expect(data.profiles.Doom.sessionLog).toEqual([])
  })

  it('preserves a valid log', () => {
    const log = [{ startedAt: 1000, seconds: 120 }]
    const data = parseAppData({ profiles: { Doom: { name: 'Doom', sessionLog: log } } })
    expect(data.profiles.Doom.sessionLog).toEqual(log)
  })

  it('keeps the short flag', () => {
    const data = parseAppData({
      profiles: { Doom: { name: 'Doom', sessionLog: [{ startedAt: 1, seconds: 5, short: true }] } }
    })
    expect(data.profiles.Doom.sessionLog[0].short).toBe(true)
  })

  it('falls back to an empty log rather than rejecting a corrupt one', () => {
    const data = parseAppData({
      profiles: { Doom: { name: 'Doom', sessionLog: 'not an array' } }
    })
    expect(data.profiles.Doom.sessionLog).toEqual([])
  })

  it('gives a fresh profile an empty log', () => {
    expect(freshAppData().profiles).toEqual({})
  })
})

describe('activeSession schema', () => {
  it('defaults to null for every save written before crash recovery existed', () => {
    const data = parseAppData({ profiles: { Doom: { name: 'Doom', seconds: 10 } } })
    expect(data.profiles.Doom.activeSession).toBeNull()
  })

  it('preserves a marker left behind by a crash', () => {
    const data = parseAppData({
      profiles: { Doom: { name: 'Doom', activeSession: { startedAt: 1000, lastSeenAt: 5000 } } }
    })
    expect(data.profiles.Doom.activeSession).toEqual({ startedAt: 1000, lastSeenAt: 5000 })
  })

  it('drops a corrupt marker rather than rejecting the profile', () => {
    const data = parseAppData({
      profiles: { Doom: { name: 'Doom', seconds: 42, activeSession: { startedAt: 'nope' } } }
    })
    expect(data.profiles.Doom.activeSession).toBeNull()
    expect(data.profiles.Doom.seconds).toBe(42)
  })
})

describe('status schema', () => {
  it('accepts the not_started status added in v3', () => {
    const data = parseAppData({ profiles: { Doom: { name: 'Doom', status: 'not_started' } } })
    expect(data.profiles.Doom.status).toBe('not_started')
  })

  it.each(['in_progress', 'completed', 'dropped', 'on_hold'] as const)('still accepts %s', (status) => {
    const data = parseAppData({ profiles: { Doom: { name: 'Doom', status } } })
    expect(data.profiles.Doom.status).toBe(status)
  })

  // The .catch default deliberately stays in_progress rather than moving to
  // not_started: an existing save with a corrupt status should keep behaving
  // exactly as it always has, not silently claim the game was never played.
  it('falls back to in_progress for an unknown status', () => {
    const data = parseAppData({ profiles: { Doom: { name: 'Doom', status: 'abandoned' } } })
    expect(data.profiles.Doom.status).toBe('in_progress')
  })

  it('lets not_started be used as a status filter', () => {
    const data = parseAppData({ profiles: {}, settings: { statusFilter: 'not_started' } })
    expect(data.settings.statusFilter).toBe('not_started')
  })
})
