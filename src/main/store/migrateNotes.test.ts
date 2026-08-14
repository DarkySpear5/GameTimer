import { describe, expect, it } from 'vitest'
import { migrateLegacyNotes } from './migrateNotes'
import type { AppData, Profile } from '@shared/types'

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
    sessionStats: { count: 0, totalSeconds: 0, longestSeconds: 0, firstPlayedAt: null, lastPlayedAt: null },
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

function dataWith(profiles: Profile[]): AppData {
  return {
    profiles: Object.fromEntries(profiles.map((p) => [p.name, p])),
    lastSelected: null
  } as AppData
}

describe('migrateLegacyNotes', () => {
  it('folds a legacy single note into a one-item list', () => {
    const data = dataWith([profile('Doom', { notes: 'stand left at the boss' })])
    expect(migrateLegacyNotes(data)).toBe(true)
    expect(data.profiles.Doom.noteList).toHaveLength(1)
    expect(data.profiles.Doom.noteList[0].body).toBe('stand left at the boss')
    expect(data.profiles.Doom.noteList[0].title).toBe('Note')
    expect(data.profiles.Doom.noteList[0].id.length).toBeGreaterThan(0)
    // The legacy field survives — see the "why" comment on migrateLegacyNotes.
    expect(data.profiles.Doom.notes).toBe('stand left at the boss')
  })

  it('does nothing for a profile with no legacy text', () => {
    const data = dataWith([profile('Doom', { notes: '' })])
    expect(migrateLegacyNotes(data)).toBe(false)
    expect(data.profiles.Doom.noteList).toEqual([])
  })

  it('does nothing for whitespace-only legacy text', () => {
    const data = dataWith([profile('Doom', { notes: '   \n  ' })])
    expect(migrateLegacyNotes(data)).toBe(false)
  })

  it('does not run twice — a profile that already has notes is left alone', () => {
    const existing = {
      id: 'existing',
      title: 'Real note',
      body: 'already migrated',
      drawing: [],
      createdAt: 1,
      updatedAt: 1
    }
    const data = dataWith([profile('Doom', { notes: 'old text', noteList: [existing] })])
    expect(migrateLegacyNotes(data)).toBe(false)
    expect(data.profiles.Doom.noteList).toEqual([existing])
  })

  it('migrates each profile independently', () => {
    const data = dataWith([profile('Doom', { notes: 'doom notes' }), profile('Portal', { notes: '' })])
    expect(migrateLegacyNotes(data)).toBe(true)
    expect(data.profiles.Doom.noteList).toHaveLength(1)
    expect(data.profiles.Portal.noteList).toEqual([])
  })
})
