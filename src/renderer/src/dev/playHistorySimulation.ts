import type { PlayHistory } from '@shared/playHistory'

/** Fixed renderer-only fixture: it is never sent through IPC or persisted. */
export const PLAY_HISTORY_SIMULATION: PlayHistory = Object.freeze({
  version: 1,
  baseline: { date: '2026-08-09', seconds: 134_576 },
  dailySeconds: Object.freeze({
    '2026-08-30': 3600,
    '2026-09-01': 19_800,
    '2026-09-03': 7_200,
    '2026-09-05': 1_800
  })
})
