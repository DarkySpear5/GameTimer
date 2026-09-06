import { earliestPlayHistoryDate, isPlayHistoryDate, type PlayHistory } from '@shared/playHistory'

export type PlayHistoryRange = 'sevenDays' | 'thirtyDays' | 'fiftyTwoWeeks' | 'allTime'

export interface PlayHistoryChartBucket {
  /** Local calendar key: YYYY-MM-DD for days/weeks, YYYY-MM for months. */
  key: string
  /** Compact label for the SVG x axis. */
  label: string
  /** Inclusive local start and end dates represented by this bucket. */
  start: Date
  end: Date
  /** Recorded daily-ledger time only. Baseline time is deliberately excluded. */
  seconds: number
}

export interface PlayHistoryChartBaseline {
  date: string
  seconds: number
  tooltip: typeof EARLIER_PLAYTIME_TOOLTIP
}

export interface PlayHistoryBucketSelection {
  buckets: PlayHistoryChartBucket[]
  /** A carry-forward total shown independently of calendar activity. */
  baseline: PlayHistoryChartBaseline | null
}

export const EARLIER_PLAYTIME_TOOLTIP = 'Earlier playtime'

/**
 * Selects fixed, local-calendar chart buckets. The baseline remains separate
 * so no chart can imply that older, un-attributed play happened on its anchor
 * date or in any later day/week/month bucket.
 */
export function selectPlayHistoryBuckets(
  history: PlayHistory,
  range: PlayHistoryRange,
  now: Date = new Date()
): PlayHistoryBucketSelection {
  const today = localDay(now)
  const baseline = selectBaseline(history)

  switch (range) {
    case 'sevenDays':
      return { buckets: dailyBuckets(history, today, 7), baseline }
    case 'thirtyDays':
      return { buckets: dailyBuckets(history, today, 30), baseline }
    case 'fiftyTwoWeeks':
      return { buckets: weeklyBuckets(history, today), baseline }
    case 'allTime':
      return { buckets: monthlyBuckets(history, today), baseline }
  }
}

function dailyBuckets(history: PlayHistory, today: Date, count: number): PlayHistoryChartBucket[] {
  const firstDay = addDays(today, 1 - count)
  return Array.from({ length: count }, (_, index) => {
    const day = addDays(firstDay, index)
    return dayBucket(history, day)
  })
}

function weeklyBuckets(history: PlayHistory, today: Date): PlayHistoryChartBucket[] {
  const firstWeek = addDays(startOfMondayWeek(today), -51 * 7)
  return Array.from({ length: 52 }, (_, index) => {
    const start = addDays(firstWeek, index * 7)
    const end = addDays(start, 6)
    return {
      key: dateKey(start),
      label: shortDateLabel(start),
      start,
      end,
      seconds: sumDays(history, start, end)
    }
  })
}

function monthlyBuckets(history: PlayHistory, today: Date): PlayHistoryChartBucket[] {
  const earliest = earliestPlayHistoryDate(history)
  const firstMonth = earliest ? new Date(Number(earliest.slice(0, 4)), Number(earliest.slice(5, 7)) - 1, 1) : monthStart(today)
  const lastMonth = monthStart(today)
  const buckets: PlayHistoryChartBucket[] = []

  for (let cursor = firstMonth; cursor <= lastMonth; cursor = addMonths(cursor, 1)) {
    const start = monthStart(cursor)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
    buckets.push({
      key: monthKey(start),
      label: monthLabel(start),
      start,
      end,
      seconds: sumDays(history, start, end)
    })
  }

  return buckets
}

function dayBucket(history: PlayHistory, day: Date): PlayHistoryChartBucket {
  return {
    key: dateKey(day),
    label: shortDateLabel(day),
    start: day,
    end: day,
    seconds: dailySeconds(history, dateKey(day))
  }
}

function selectBaseline(history: PlayHistory): PlayHistoryChartBaseline | null {
  const baseline = history.baseline
  if (!baseline || !isPlayHistoryDate(baseline.date) || !Number.isFinite(baseline.seconds)) return null

  return { date: baseline.date, seconds: Math.max(0, baseline.seconds), tooltip: EARLIER_PLAYTIME_TOOLTIP }
}

function sumDays(history: PlayHistory, start: Date, end: Date): number {
  let seconds = 0
  for (let day = start; day <= end; day = addDays(day, 1)) seconds += dailySeconds(history, dateKey(day))
  return seconds
}

function dailySeconds(history: PlayHistory, key: string): number {
  const seconds = history.dailySeconds[key]
  return Number.isFinite(seconds) ? Math.max(0, seconds) : 0
}

function localDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function startOfMondayWeek(date: Date): Date {
  const day = date.getDay()
  return addDays(date, day === 0 ? -6 : 1 - day)
}

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

function dateKey(date: Date): string {
  return `${date.getFullYear().toString().padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function monthKey(date: Date): string {
  return dateKey(date).slice(0, 7)
}

function shortDateLabel(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
}

function monthLabel(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
}
