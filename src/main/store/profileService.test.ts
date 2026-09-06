import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseAppData } from './schema'
import type { AppData } from '@shared/types'
import { emptyPlayHistory } from '@shared/playHistory'

let currentData: AppData

vi.mock('./dataStore', () => ({
  dataStore: {
    get: () => currentData,
    safeSave: vi.fn()
  }
}))

vi.mock('./paths', () => ({
  paths: {
    iconsDir: () => 'icons',
    backgroundsDir: () => 'backgrounds',
    coversDir: () => 'covers'
  }
}))

vi.mock('../timer/timerEngine', () => ({
  timerEngine: {
    checkpointOne: vi.fn(),
    renameActive: vi.fn(),
    stopActive: vi.fn(),
    restartActiveIfRunning: vi.fn(),
    isRunning: vi.fn(() => false),
    getPendingCategoryStart: vi.fn(),
    clearPendingCategoryStart: vi.fn(),
    setActiveCategoryAssignment: vi.fn()
  }
}))

vi.mock('../statusLog/writeStatusLog', () => ({ writeStatusLog: vi.fn() }))
vi.mock('../util/date', () => ({ todayDateString: () => '2026-09-05' }))
vi.mock('../util/imageResize', () => ({ saveCappedImage: vi.fn() }))
vi.mock('../art/enrich', () => ({ enrichGame: vi.fn(), storeArtFromUrl: vi.fn() }))

import { profileService } from './profileService'

function seededData(): AppData {
  return parseAppData({
    profiles: {
      Doom: {
        name: 'Doom',
        seconds: 130,
        startedDate: '2021-04-05',
        playHistory: {
          version: 1,
          baseline: { date: '2021-04-05', seconds: 100 },
          dailySeconds: { '2026-09-05': 30 }
        }
      }
    }
  })
}

describe('profileService play history', () => {
  beforeEach(() => {
    currentData = seededData()
  })

  it('gives a newly created profile an empty ledger', async () => {
    const profile = await profileService.create('Quake')

    expect(profile.playHistory).toEqual(emptyPlayHistory())
  })

  it('deep-copies play history when duplicating a profile', async () => {
    const copy = await profileService.duplicate('Doom')
    copy.playHistory!.dailySeconds['2026-09-05'] = 60
    copy.playHistory!.baseline!.seconds = 70

    expect(copy.playHistory).toEqual({
      version: 1,
      baseline: { date: '2021-04-05', seconds: 70 },
      dailySeconds: { '2026-09-05': 60 }
    })
    expect(currentData.profiles.Doom.playHistory).toEqual({
      version: 1,
      baseline: { date: '2021-04-05', seconds: 100 },
      dailySeconds: { '2026-09-05': 30 }
    })
  })

  it('applies a manual time addition to the baseline only', async () => {
    const profile = await profileService.addRemoveTime('Doom', 20)

    expect(profile.seconds).toBe(150)
    expect(profile.playHistory).toEqual({
      version: 1,
      baseline: { date: '2021-04-05', seconds: 120 },
      dailySeconds: { '2026-09-05': 30 }
    })
  })

  it('clears the permanent ledger when resetting playtime', async () => {
    const profile = await profileService.resetTime('Doom')

    expect(profile.playHistory).toEqual(emptyPlayHistory())
  })
})
