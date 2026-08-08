import { describe, expect, it } from 'vitest'
import { mapTagsToGenres } from './genreMap'

// Real SteamSpy tag lists, in ranked order, fetched 2026-08-08.
const DOOM = ['FPS', 'Action', 'Gore', 'Great Soundtrack', 'Fast-Paced', 'Violent', 'Demons', 'Shooter']
const STARDEW = ['Farming Sim', 'Pixel Graphics', 'Multiplayer', 'Life Sim', 'RPG', 'Relaxing', 'Simulation']
const HOLLOW = ['Metroidvania', 'Souls-like', 'Platformer', '2D', 'Difficult', 'Indie', 'Story Rich']

describe('mapTagsToGenres', () => {
  it('matches tags whose wording differs only by punctuation or case', () => {
    expect(mapTagsToGenres(['Sci-fi', 'Story Rich', 'Souls-like', 'Multiple Endings'], 10)).toEqual([
      'Sci-Fi',
      'Story-Rich',
      'Soulslike',
      'Multiple Endings'
    ])
  })

  it('maps DOOM Eternal the way a person would tag it', () => {
    // Steam's store genres return only "Action" for this game.
    const g = mapTagsToGenres(DOOM)
    expect(g).toContain('FPS')
    expect(g).toContain('Action')
    expect(g).toContain('Gore')
    expect(g).toContain('Shooter')
  })

  it('maps Stardew Valley', () => {
    const g = mapTagsToGenres(STARDEW)
    expect(g).toContain('Farming')
    expect(g).toContain('Life-Sim')
    expect(g).toContain('RPG')
    expect(g).toContain('Simulation')
  })

  it('maps Hollow Knight', () => {
    const g = mapTagsToGenres(HOLLOW)
    expect(g).toContain('Soulslike')
    expect(g).toContain('Platformer')
    expect(g).toContain('Difficult')
  })

  it('drops tags Gamut has no equivalent for rather than approximating', () => {
    // Metroidvania, Great Soundtrack, Relaxing, 2D and Indie are not Gamut genres.
    expect(mapTagsToGenres(['Metroidvania', 'Great Soundtrack', 'Relaxing', '2D', 'Indie'], 10)).toEqual([])
  })

  it('de-duplicates tags that collapse to the same genre', () => {
    expect(mapTagsToGenres(['Violent', 'Blood', 'Gore'], 10)).toEqual(['Gore'])
  })

  it('caps the list so a long tail does not become noise', () => {
    expect(mapTagsToGenres(DOOM, 3)).toHaveLength(3)
  })

  it('returns empty for no tags', () => {
    expect(mapTagsToGenres([])).toEqual([])
  })
})
