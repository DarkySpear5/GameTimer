import { describe, expect, it } from 'vitest'
import type { PlayHistory } from '@shared/playHistory'
import {
  EARLIER_PLAYTIME_TOOLTIP,
  selectPlayHistoryBuckets,
  type PlayHistoryRange
} from './playHistoryBuckets'

function history(dailySeconds: Record<string, number> = {}, baseline: PlayHistory['baseline'] = null): PlayHistory {
  return { version: 1, baseline, dailySeconds }
}

function localDate(year: number, monthIndex: number, day: number): Date {
  return new Date(year, monthIndex, day, 12)
}

describe('selectPlayHistoryBuckets', () => {
  it('returns seven local daily buckets for an empty history', () => {
    const result = selectPlayHistoryBuckets(history(), 'sevenDays', localDate(2026, 8, 5))

    expect(result.buckets.map((bucket) => [bucket.key, bucket.seconds])).toEqual([
      ['2026-08-30', 0],
      ['2026-08-31', 0],
      ['2026-09-01', 0],
      ['2026-09-02', 0],
      ['2026-09-03', 0],
      ['2026-09-04', 0],
      ['2026-09-05', 0]
    ])
    expect(result.baseline).toBeNull()
  })

  it('keeps baseline-only history out of daily totals with its exact tooltip copy', () => {
    const result = selectPlayHistoryBuckets(
      history({}, { date: '2024-01-15', seconds: 5_400 }),
      'allTime',
      localDate(2024, 2, 20)
    )

    expect(result.buckets.map((bucket) => [bucket.key, bucket.seconds])).toEqual([
      ['2024-01', 0],
      ['2024-02', 0],
      ['2024-03', 0]
    ])
    expect(result.baseline).toEqual({ date: '2024-01-15', seconds: 5_400, tooltip: 'Earlier playtime' })
    expect(EARLIER_PLAYTIME_TOOLTIP).toBe('Earlier playtime')
  })

  it('retains calendar days whose recorded total is zero', () => {
    const result = selectPlayHistoryBuckets(
      history({ '2026-09-03': 0, '2026-09-04': 1_800 }),
      'sevenDays',
      localDate(2026, 8, 5)
    )

    expect(result.buckets.slice(-3).map((bucket) => [bucket.key, bucket.seconds])).toEqual([
      ['2026-09-03', 0],
      ['2026-09-04', 1_800],
      ['2026-09-05', 0]
    ])
  })

  it('uses complete Monday-to-Sunday local weeks at the 52-week boundary', () => {
    const result = selectPlayHistoryBuckets(
      history({
        '2025-01-12': 100,
        '2025-01-13': 200,
        '2026-01-11': 300,
        '2026-01-12': 400
      }),
      'fiftyTwoWeeks',
      localDate(2026, 0, 7)
    )

    expect(result.buckets).toHaveLength(52)
    expect(result.buckets[0]).toMatchObject({ key: '2025-01-13', seconds: 200 })
    expect(result.buckets.at(-1)).toMatchObject({ key: '2026-01-05', seconds: 300 })
  })

  it('aggregates each all-time month across multiple years while retaining zero months', () => {
    const result = selectPlayHistoryBuckets(
      history({
        '2023-12-31': 1_800,
        '2024-01-01': 3_600,
        '2025-01-16': 900
      }),
      'allTime',
      localDate(2025, 0, 20)
    )

    expect(result.buckets).toHaveLength(14)
    expect(result.buckets.slice(0, 3).map((bucket) => [bucket.key, bucket.seconds])).toEqual([
      ['2023-12', 1_800],
      ['2024-01', 3_600],
      ['2024-02', 0]
    ])
    expect(result.buckets.at(-1)).toMatchObject({ key: '2025-01', seconds: 900 })
  })
})

describe('PlayHistoryRange', () => {
  it.each<PlayHistoryRange>(['sevenDays', 'thirtyDays', 'fiftyTwoWeeks', 'allTime'])(
    'is accepted by the selector: %s',
    (range) => {
      expect(selectPlayHistoryBuckets(history(), range, localDate(2026, 8, 5)).buckets.length).toBeGreaterThan(0)
    }
  )
})
