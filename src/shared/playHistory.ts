/** Versioned so future ledger changes can be migrated without guessing its shape. */
export const PLAY_HISTORY_VERSION = 1

/** Playtime whose exact calendar days predate the daily ledger. */
export interface PlayHistoryBaseline {
  /** Local calendar day shown as YYYY-MM-DD; it anchors context, not activity. */
  date: string
  seconds: number
}

/**
 * Permanent, compact playtime history. Unlike sessionLog this keeps one total
 * per local calendar day and has no retention cap.
 */
export interface PlayHistory {
  version: typeof PLAY_HISTORY_VERSION
  baseline: PlayHistoryBaseline | null
  dailySeconds: Record<string, number>
}

export function emptyPlayHistory(): PlayHistory {
  return { version: PLAY_HISTORY_VERSION, baseline: null, dailySeconds: {} }
}

/** Returns whether a string names a real calendar day in the local time zone. */
export function isPlayHistoryDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1) return false

  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

/** Copies only serializable values, so duplicate/import paths never share ledger state. */
export function clonePlayHistory(history: PlayHistory): PlayHistory {
  return {
    version: history.version,
    baseline: history.baseline ? { ...history.baseline } : null,
    dailySeconds: { ...history.dailySeconds }
  }
}

/**
 * Adds elapsed wall-clock time to the real local days it crossed. The input is
 * never changed, allowing checkpoints to replace the ledger atomically.
 */
export function recordElapsed(history: PlayHistory, startedAt: number, endedAt: number): PlayHistory {
  const next = clonePlayHistory(history)
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) return next

  let cursor = startedAt
  while (cursor < endedAt) {
    const date = new Date(cursor)
    const dateKey = localDateKey(date)
    const nextMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
    const boundary = Math.min(endedAt, nextMidnight)
    const seconds = (boundary - cursor) / 1_000

    if (seconds > 0) next.dailySeconds[dateKey] = (next.dailySeconds[dateKey] ?? 0) + seconds
    cursor = boundary
  }

  return next
}

/** Earliest date the chart can represent without inventing history. */
export function earliestPlayHistoryDate(history: PlayHistory): string | null {
  const dates = Object.keys(history.dailySeconds).filter(isPlayHistoryDate)
  if (history.baseline && isPlayHistoryDate(history.baseline.date)) dates.push(history.baseline.date)
  return dates.length === 0 ? null : dates.sort()[0]
}

function localDateKey(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}
