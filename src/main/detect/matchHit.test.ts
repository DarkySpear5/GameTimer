import { describe, expect, it } from 'vitest'
import { exactHit, looksLikeGame } from './matchHit'

// Real responses from steamcommunity.com/actions/SearchApps, 2026-08-07.
const HOLLOW = [
  { appId: 1030300, name: 'Hollow Knight: Silksong' },
  { appId: 367520, name: 'Hollow Knight' }
]
const CLAUDE = [
  { appId: 1071170, name: 'Claude Monet - The Water Lily obsession' },
  { appId: 4437280, name: 'Meet Claude' },
  { appId: 4897790, name: 'World of ClaudeCraft' }
]
const DISCORD = [
  { appId: 682130, name: 'Discord Bot Maker' },
  { appId: 2592170, name: 'Bot Maker For Discord' }
]
const DOOM = [
  { appId: 782330, name: 'DOOM Eternal' },
  { appId: 2545650, name: 'DOOM Eternal: idStudio' }
]

describe('exactHit', () => {
  it('prefers the exact title over a better-ranked sequel', () => {
    // Silksong is Steam's first result for "Hollow Knight" — taking [0] was a bug.
    expect(exactHit('Hollow Knight', HOLLOW)?.appId).toBe(367520)
  })

  it('ignores case differences', () => {
    expect(exactHit('Doom Eternal', DOOM)?.appId).toBe(782330)
  })

  it('ignores punctuation and spacing differences', () => {
    expect(exactHit('MarvelRivals', [{ appId: 2767030, name: 'Marvel Rivals' }])?.appId).toBe(2767030)
    expect(exactHit('Nier Automata', [{ appId: 1, name: 'NieR:Automata™' }])?.appId).toBe(1)
  })

  it('returns null when the query only appears inside other titles', () => {
    expect(exactHit('Claude', CLAUDE)).toBeNull()
    expect(exactHit('Discord', DISCORD)).toBeNull()
  })

  it('returns null for no hits or an empty query', () => {
    expect(exactHit('AMD Software', [])).toBeNull()
    expect(exactHit('', HOLLOW)).toBeNull()
  })
})

describe('looksLikeGame', () => {
  it('accepts real games', () => {
    expect(looksLikeGame('Hollow Knight', HOLLOW)).toBe(true)
    expect(looksLikeGame('Doom Eternal', DOOM)).toBe(true)
  })

  it('rejects apps that merely share a word with some game', () => {
    expect(looksLikeGame('Claude', CLAUDE)).toBe(false)
    expect(looksLikeGame('Discord', DISCORD)).toBe(false)
    expect(looksLikeGame('SteelSeries GG', [])).toBe(false)
  })
})
