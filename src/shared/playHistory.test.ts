import { describe, expect, it } from 'vitest'
import {
  clonePlayHistory,
  emptyPlayHistory,
  earliestPlayHistoryDate,
  isPlayHistoryDate,
  recordElapsed
} from './playHistory'

function localTime(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number {
  return new Date(year, month - 1, day, hour, minute, second).getTime()
}

describe('isPlayHistoryDate', () => {
  it('accepts only real local ISO calendar dates', () => {
    expect(isPlayHistoryDate('2026-02-28')).toBe(true)
    expect(isPlayHistoryDate('2026-02-29')).toBe(false)
    expect(isPlayHistoryDate('2026-2-28')).toBe(false)
    expect(isPlayHistoryDate('not-a-date')).toBe(false)
  })
})

describe('recordElapsed', () => {
  it('records a same-day interval without changing the input ledger', () => {
    const original = emptyPlayHistory()
    const recorded = recordElapsed(original, localTime(2026, 9, 5, 12), localTime(2026, 9, 5, 12, 2))

    expect(recorded.dailySeconds).toEqual({ '2026-09-05': 120 })
    expect(original.dailySeconds).toEqual({})
  })

  it('credits each side of a local midnight to its actual calendar day', () => {
    const recorded = recordElapsed(
      emptyPlayHistory(),
      localTime(2026, 9, 5, 23, 59, 59),
      localTime(2026, 9, 6, 0, 0, 2)
    )

    expect(recorded.dailySeconds).toEqual({ '2026-09-05': 1, '2026-09-06': 2 })
  })

  it('does not add a zero-second entry when elapsed time ends exactly at midnight', () => {
    const recorded = recordElapsed(
      emptyPlayHistory(),
      localTime(2026, 9, 5, 23, 59),
      localTime(2026, 9, 6)
    )

    expect(recorded.dailySeconds).toEqual({ '2026-09-05': 60 })
  })

  it('allocates full intermediate calendar days in a multi-day interval', () => {
    const recorded = recordElapsed(
      emptyPlayHistory(),
      localTime(2026, 9, 5, 23, 59, 30),
      localTime(2026, 9, 8, 0, 0, 30)
    )

    expect(recorded.dailySeconds).toEqual({
      '2026-09-05': 30,
      '2026-09-06': 86_400,
      '2026-09-07': 86_400,
      '2026-09-08': 30
    })
  })

  it('ignores zero and negative intervals', () => {
    const history = { ...emptyPlayHistory(), dailySeconds: { '2026-09-05': 30 } }

    expect(recordElapsed(history, localTime(2026, 9, 5), localTime(2026, 9, 5))).toEqual(history)
    expect(recordElapsed(history, localTime(2026, 9, 6), localTime(2026, 9, 5))).toEqual(history)
  })
})

describe('clonePlayHistory', () => {
  it('makes a serialization-safe deep copy', () => {
    const original = {
      version: 1 as const,
      baseline: { date: '2020-01-01', seconds: 3_600 },
      dailySeconds: { '2026-09-05': 60 }
    }
    const clone = clonePlayHistory(original)
    clone.dailySeconds['2026-09-05'] = 120
    clone.baseline!.seconds = 7_200

    expect(JSON.parse(JSON.stringify(clone))).toEqual(clone)
    expect(original).toEqual({
      version: 1,
      baseline: { date: '2020-01-01', seconds: 3_600 },
      dailySeconds: { '2026-09-05': 60 }
    })
  })
})

describe('earliestPlayHistoryDate', () => {
  it('returns the earliest retained baseline or recorded day', () => {
    const history = {
      version: 1 as const,
      baseline: { date: '2021-03-04', seconds: 900 },
      dailySeconds: { '2026-09-05': 60, '2026-09-01': 120 }
    }

    expect(earliestPlayHistoryDate(history)).toBe('2021-03-04')
    expect(earliestPlayHistoryDate(emptyPlayHistory())).toBeNull()
  })
})
