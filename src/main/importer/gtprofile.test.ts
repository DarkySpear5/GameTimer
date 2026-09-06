import { describe, expect, it, vi } from 'vitest'
import { parseAppData, parseGtProfileFile } from '../store/schema'
import type { GtProfileFile, Profile } from '@shared/types'
import { recordElapsed } from '@shared/playHistory'
import { recoverSession } from '@shared/recoverSession'
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

  it('gives a legacy import an immediate baseline for its existing total', () => {
    const imported = profileFromGtProfileFile(
      'Doom (Imported)',
      parseGtProfileFile({ name: 'Doom', seconds: 120, startedDate: '2021-04-05' }),
      null,
      null
    )

    expect(imported.playHistory).toEqual({
      version: 1,
      baseline: { date: '2021-04-05', seconds: 120 },
      dailySeconds: {}
    })
  })

  it('does not re-credit a post-import checkpoint during crash recovery', () => {
    const startedAt = new Date(2026, 8, 5, 12).getTime()
    const lastSeenAt = startedAt + 60_000
    const imported = profileFromGtProfileFile(
      'Doom (Imported)',
      parseGtProfileFile({ name: 'Doom', seconds: 120, startedDate: '2021-04-05' }),
      null,
      null
    )
    imported.seconds += 60
    imported.playHistory = recordElapsed(imported.playHistory!, startedAt, lastSeenAt)
    imported.activeSession = { startedAt, lastSeenAt }

    recoverSession(imported)

    expect(imported.playHistory).toEqual({
      version: 1,
      baseline: { date: '2021-04-05', seconds: 120 },
      dailySeconds: { '2026-09-05': 60 }
    })
  })
})
