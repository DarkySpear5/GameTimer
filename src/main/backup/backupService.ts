import { promises as fs, existsSync } from 'fs'
import { join } from 'path'
import { paths } from '../store/paths'
import { todayDateString } from '../util/date'
import { BACKUP_RETENTION_DAYS } from '@shared/constants'

/**
 * One dated snapshot of the data file per calendar day, pruned after 14
 * days — the atomic save already protects against a crash mid-write, but
 * not against a user mistake (a wrong Reset Time, a bad import). Entirely
 * best-effort: must never block or crash normal saving.
 */
async function runDailyBackup(): Promise<void> {
  try {
    if (!existsSync(paths.dataFile())) return
    await fs.mkdir(paths.backupsDir(), { recursive: true })
    const dest = join(paths.backupsDir(), `game_timer_data_${todayDateString()}.json`)
    if (!existsSync(dest)) {
      await fs.copyFile(paths.dataFile(), dest)
    }
    const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 86400 * 1000
    const entries = await fs.readdir(paths.backupsDir())
    for (const fname of entries) {
      const fpath = join(paths.backupsDir(), fname)
      try {
        const stat = await fs.stat(fpath)
        if (stat.mtimeMs < cutoff) await fs.unlink(fpath)
      } catch {
        // best-effort pruning
      }
    }
  } catch {
    // backups are best-effort, must never block normal saving
  }
}

export const backupService = { runDailyBackup }
