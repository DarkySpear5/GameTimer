import { describe, expect, it } from 'vitest'
import { displaySeconds, matchesSearch, platformRank, sortAndFilterProfiles } from './selectors'
import type { Profile } from '@shared/types'

function profile(name: string, overrides: Partial<Profile> = {}): Profile {
  return {
    name,
    seconds: 0,
    iconFile: null,
    bgColor: null,
    bgImage: null,
    status: 'in_progress',
    statusAt: null,
    statusSeconds: null,
    genres: [],
    lastPlayed: null,
    startedDate: null,
    notes: '',
    noteList: [],
    rating: 0,
    sessionStats: {
      count: 0,
      totalSeconds: 0,
      longestSeconds: 0,
      firstPlayedAt: null,
      lastPlayedAt: null
    },
    sessionLog: [],
    activeSession: null,
    exePath: null,
    steamAppId: null,
    autoFetchArt: null,
    launches: 0,
    openSeconds: 0,
    autoStartTimer: null,
    genresFromDetection: false,
    favorite: false,
    coverFile: null,
    launchUri: null,
    installDir: null,
    ...overrides
  }
}

function library(...profiles: Profile[]): Record<string, Profile> {
  return Object.fromEntries(profiles.map((p) => [p.name, p]))
}

const names = (list: Profile[]): string[] => list.map((p) => p.name)

describe('sortAndFilterProfiles — orderings', () => {
  const games = library(
    profile('Celeste', { seconds: 500, rating: 3, favorite: true, lastPlayed: 300 }),
    profile('Alba', { seconds: 100, rating: 5, favorite: false, lastPlayed: 100 }),
    profile('Braid', { seconds: 900, rating: 1, favorite: true, lastPlayed: 200 })
  )

  it('sorts A-Z by name', () => {
    expect(names(sortAndFilterProfiles(games, 'name', 'All', 'All'))).toEqual(['Alba', 'Braid', 'Celeste'])
  })

  it('sorts Z-A by name', () => {
    expect(names(sortAndFilterProfiles(games, 'name_desc', 'All', 'All'))).toEqual([
      'Celeste',
      'Braid',
      'Alba'
    ])
  })

  it('sorts by playtime, longest first', () => {
    expect(names(sortAndFilterProfiles(games, 'playtime', 'All', 'All'))).toEqual([
      'Braid',
      'Celeste',
      'Alba'
    ])
  })

  it('sorts favourites first', () => {
    expect(names(sortAndFilterProfiles(games, 'favorite', 'All', 'All'))).toEqual([
      'Braid',
      'Celeste',
      'Alba'
    ])
  })

  it('sorts by last played, most recent first', () => {
    expect(names(sortAndFilterProfiles(games, 'last_played', 'All', 'All'))).toEqual([
      'Celeste',
      'Braid',
      'Alba'
    ])
  })

  it('sorts by rating, highest first', () => {
    expect(names(sortAndFilterProfiles(games, 'rating', 'All', 'All'))).toEqual([
      'Alba',
      'Celeste',
      'Braid'
    ])
  })
})

describe('sortAndFilterProfiles — playtime uses live seconds', () => {
  // The whole point of the `running` parameter. A game that is being played
  // right now has time that hasn't been committed to profile.seconds yet, so
  // sorting on the stored field alone parks it at whatever position it held
  // when the timer last checkpointed.
  const games = library(profile('Quiet', { seconds: 500 }), profile('Playing', { seconds: 100 }))

  it('ranks a running game by its live total, not its stored total', () => {
    expect(names(sortAndFilterProfiles(games, 'playtime', 'All', 'All', { Playing: 900 }))).toEqual([
      'Playing',
      'Quiet'
    ])
  })

  it('falls back to stored seconds when nothing is running', () => {
    expect(names(sortAndFilterProfiles(games, 'playtime', 'All', 'All', {}))).toEqual([
      'Quiet',
      'Playing'
    ])
  })

  it('treats an omitted running record as nothing running', () => {
    expect(names(sortAndFilterProfiles(games, 'playtime', 'All', 'All'))).toEqual(['Quiet', 'Playing'])
  })
})

describe('sortAndFilterProfiles — ties fall through to name', () => {
  // Without the byName fallthrough these orderings would depend on insertion
  // order, so the list would appear to reshuffle whenever anything unrelated
  // updated the store.
  const tied = library(
    profile('Zeta', { seconds: 100, rating: 2, favorite: true, lastPlayed: 5 }),
    profile('Alpha', { seconds: 100, rating: 2, favorite: true, lastPlayed: 5 })
  )

  it.each(['playtime', 'favorite', 'rating', 'last_played'] as const)('breaks a %s tie by name', (mode) => {
    expect(names(sortAndFilterProfiles(tied, mode, 'All', 'All'))).toEqual(['Alpha', 'Zeta'])
  })

  it('breaks a playtime tie by name even when both are running', () => {
    expect(
      names(sortAndFilterProfiles(tied, 'playtime', 'All', 'All', { Zeta: 400, Alpha: 400 }))
    ).toEqual(['Alpha', 'Zeta'])
  })
})

describe('sortAndFilterProfiles — filtering still applies', () => {
  const games = library(
    profile('Indie', { genres: ['Platformer'], status: 'completed' }),
    profile('Shooter', { genres: ['FPS'], status: 'in_progress' })
  )

  it('filters by genre', () => {
    expect(names(sortAndFilterProfiles(games, 'name', 'FPS', 'All'))).toEqual(['Shooter'])
  })

  it('filters by status', () => {
    expect(names(sortAndFilterProfiles(games, 'name', 'All', 'completed'))).toEqual(['Indie'])
  })

  it('applies both filters together', () => {
    expect(names(sortAndFilterProfiles(games, 'name', 'FPS', 'completed'))).toEqual([])
  })
})

describe('displaySeconds', () => {
  it('prefers the live value when the game is running', () => {
    expect(displaySeconds(profile('A', { seconds: 10 }), { A: 99 })).toBe(99)
  })

  it('uses the stored value when it is not', () => {
    expect(displaySeconds(profile('A', { seconds: 10 }), {})).toBe(10)
  })

  it('treats a live zero as running, not as absent', () => {
    expect(displaySeconds(profile('A', { seconds: 10 }), { A: 0 })).toBe(0)
  })
})

describe('platformRank', () => {
  // A profile never stores which storefront it came from — it stores how to
  // START it, which is the same fact seen from the other side.
  it('puts Steam first, by appid', () => {
    expect(platformRank(profile('A', { steamAppId: 400 }))).toBe(0)
  })

  it.each([
    ['shell:appsFolder\\Microsoft.AcornUWP_8wekyb3d8bbwe!App', 1],
    ['com.epicgames.launcher://apps/Sugar?action=launch', 2],
    ['origin2://game/launch?offerIds=1', 3],
    ['battlenet://heroes', 4],
    ['goggalaxy://openGameView/123', 5],
    ['nxl://launch/10300', 6]
  ])('ranks %s by its launcher', (uri, rank) => {
    expect(platformRank(profile('A', { launchUri: uri }))).toBe(rank)
  })

  it('sorts a bare executable last', () => {
    expect(platformRank(profile('A', { exePath: 'C:\\Games\\game.exe' }))).toBe(7)
  })

  it('orders a mixed library Steam → Xbox → Epic → EA → Battle.net → GOG → Nexon → other', () => {
    const games = library(
      profile('Nex', { launchUri: 'nxl://launch/1' }),
      profile('Steam', { steamAppId: 1 }),
      profile('Plain', {}),
      profile('Xbox', { launchUri: 'shell:appsFolder\\A_b!App' }),
      profile('Epic', { launchUri: 'com.epicgames.launcher://apps/x' })
    )
    expect(names(sortAndFilterProfiles(games, 'platform', 'All', 'All'))).toEqual([
      'Steam',
      'Xbox',
      'Epic',
      'Nex',
      'Plain'
    ])
  })
})

describe('matchesSearch', () => {
  const doom = profile('DOOM Eternal', { genres: ['FPS', 'Action'] })

  it('matches an empty query', () => {
    expect(matchesSearch(doom, '   ')).toBe(true)
  })

  it('ignores case and punctuation', () => {
    expect(matchesSearch(doom, 'doom eternal')).toBe(true)
    expect(matchesSearch(profile('Ratchet & Clank'), 'ratchetclank')).toBe(true)
  })

  it('matches a fragment spanning a space', () => {
    expect(matchesSearch(doom, 'doomet')).toBe(true)
  })

  it('matches on genre too', () => {
    expect(matchesSearch(doom, 'fps')).toBe(true)
  })

  it('rejects a non-match', () => {
    expect(matchesSearch(doom, 'stardew')).toBe(false)
  })
})
