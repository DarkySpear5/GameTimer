import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseAppData } from '../store/schema'
import type { AppData } from '@shared/types'

let currentData: AppData

vi.mock('../store/dataStore', () => ({
  dataStore: {
    get: () => currentData,
    save: vi.fn(),
    safeSave: vi.fn()
  }
}))

vi.mock('../statusLog/writeStatusLog', () => ({ writeStatusLog: vi.fn() }))
vi.mock('../backup/backupService', () => ({ backupService: { runDailyBackup: vi.fn() } }))
vi.mock('../util/date', () => ({ todayDateString: () => '2026-09-05' }))

import { timerEngine } from './timerEngine'

describe('TimerEngine play history', () => {
  let now: number

  beforeEach(() => {
    currentData = parseAppData({ profiles: { Doom: { name: 'Doom' } } })
    now = new Date(2026, 8, 5, 12, 0, 0).getTime()
    vi.spyOn(Date, 'now').mockImplementation(() => now)
  })

  it('records a paused interval in the same daily ledger as the canonical total', () => {
    timerEngine.start('Doom')
    now += 120_000

    timerEngine.pause('Doom')

    expect(currentData.profiles.Doom.seconds).toBe(120)
    expect(currentData.profiles.Doom.playHistory?.dailySeconds).toEqual({ '2026-09-05': 120 })
  })

  it('splits a single checkpoint across local midnight', () => {
    now = new Date(2026, 8, 5, 23, 59, 30).getTime()
    timerEngine.start('Doom')
    now += 60_000

    timerEngine.checkpointOne('Doom')
    timerEngine.pause('Doom')

    expect(currentData.profiles.Doom.seconds).toBe(60)
    expect(currentData.profiles.Doom.playHistory?.dailySeconds).toEqual({
      '2026-09-05': 30,
      '2026-09-06': 30
    })
  })

  it('records each running profile during an all-timer checkpoint', () => {
    currentData.profiles.Quake = parseAppData({ profiles: { Quake: { name: 'Quake' } } }).profiles.Quake
    timerEngine.start('Doom')
    timerEngine.start('Quake')
    now += 45_000

    ;(timerEngine as unknown as { checkpointAll(): void }).checkpointAll()
    timerEngine.pauseAll()

    expect(currentData.profiles.Doom.playHistory?.dailySeconds).toEqual({ '2026-09-05': 45 })
    expect(currentData.profiles.Quake.playHistory?.dailySeconds).toEqual({ '2026-09-05': 45 })
  })
})
