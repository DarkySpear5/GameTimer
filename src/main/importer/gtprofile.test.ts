import { describe, expect, it, vi } from 'vitest'
import { parseAppData, parseGtProfileFile } from '../store/schema'
import type { GtProfileFile, Profile } from '@shared/types'
import * as gtprofileModule from './gtprofile'

vi.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() }
}))
vi.mock('../store/dataStore', () => ({ dataStore: { get: vi.fn(), safeSave: vi.fn() } }))
vi.mock('../store/paths', () => ({
  paths: {
    profilesDir: () => 'profiles',
    iconsDir: () => 'icons',
    backgroundsDir: () => 'backgrounds'
  }
}))
vi.mock('../timer/timerEngine', () => ({ timerEngine: { checkpointOne: vi.fn() } }))
vi.mock('../statusLog/writeStatusLog', () => ({ writeStatusLog: vi.fn() }))
vi.mock('../util/imageResize', () => ({ saveCappedImageBuffer: vi.fn() }))

const { profileFromGtProfileFile, profileToGtProfileFile } = gtprofileModule as typeof gtprofileModule & {
  profileFromGtProfileFile(name: string, imported: GtProfileFile, iconFile: string | null, bgImageFile: string | null): Profile
  profileToGtProfileFile(profile: Profile): GtProfileFile
}

describe('gtprofile play history', () => {
  it('round-trips a copied ledger through the validated portable profile shape', () => {
    const original = parseAppData({
      profiles: {
        Doom: {
          name: 'Doom',
          seconds: 150,
          playHistory: {
            version: 1,
            baseline: { date: '2021-04-05', seconds: 120 },
            dailySeconds: { '2026-09-05': 30 }
          }
        }
      }
    }).profiles.Doom

    const exported = profileToGtProfileFile(original)
    const imported = profileFromGtProfileFile('Doom (Imported)', parseGtProfileFile(exported), null, null)
    imported.playHistory!.dailySeconds['2026-09-05'] = 60

    expect(exported.playHistory).toEqual({
      version: 1,
      baseline: { date: '2021-04-05', seconds: 120 },
      dailySeconds: { '2026-09-05': 30 }
    })
    expect(original.playHistory?.dailySeconds).toEqual({ '2026-09-05': 30 })
    expect(imported.playHistory).toEqual({
      version: 1,
      baseline: { date: '2021-04-05', seconds: 120 },
      dailySeconds: { '2026-09-05': 60 }
    })
  })
})
