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
