import { promises as fs } from 'fs'
import { paths } from '../store/paths'
import { dataStore } from '../store/dataStore'
import { formatSeconds } from '@shared/format'
import { timestampString } from '../util/date'
import type { Status } from '@shared/types'

const STATUS_LABELS: Partial<Record<Status, string>> = {
  completed: 'Completed',
  dropped: 'Dropped',
  on_hold: 'On Hold'
}

/**
 * Fully overwrites a human-readable snapshot (game_timer_log.txt) — not an
 * append-only log, despite the filename. Mirrors v1's write_log_file()
 * exactly, including its "never crash the app" contract.
 */
export async function writeStatusLog(): Promise<void> {
  try {
    const data = dataStore.get()
    const entries = Object.entries(data.profiles)
    const totalSeconds = entries.reduce((sum, [, p]) => sum + p.seconds, 0)
    const completedCount = entries.filter(([, p]) => p.status === 'completed').length

    const lines: string[] = []
    lines.push('GAMUT — LOG')
    lines.push(`Last updated: ${timestampString()}`)
    lines.push('')
    lines.push('SUMMARY')
    lines.push(`  Total time played : ${formatSeconds(totalSeconds)}`)
    lines.push(`  Games tracked     : ${entries.length}`)
    lines.push(`  Games completed   : ${completedCount}`)
    lines.push('')
    lines.push('GAMES')

    const nameWidth = Math.max(...entries.map(([n]) => n.length), 10) + 2
    for (const [name, info] of entries) {
      const statusLabel = STATUS_LABELS[info.status] ?? 'In Progress'
      let completedOn = ''
      // Gated on status, not merely on statusAt being present: an un-completed
      // game now keeps its old snapshot (see profileService.setStatus), and
      // rendering it unconditionally here would read as the nonsense
      // "In Progress (2026-08-07, at 18:54:45)".
      if (info.status !== 'in_progress' && info.statusAt) {
        const stamp = info.statusSeconds != null ? `, at ${formatSeconds(info.statusSeconds)}` : ''
        completedOn = ` (${info.statusAt}${stamp})`
      }
      const genre = info.genres.join(', ')
      lines.push(
        `  ${name.padEnd(nameWidth)} ${formatSeconds(info.seconds).padStart(14)}  ` +
          `${statusLabel}${completedOn}  [${genre}]`
      )
    }

    await fs.writeFile(paths.logFile(), lines.join('\n') + '\n', 'utf-8')
  } catch {
    // logging must never crash the app
  }
}
