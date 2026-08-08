import { app } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { filterAndRank, type RawProcess } from './processFilter'
import type { DetectedApp } from '@shared/types'

const execFileAsync = promisify(execFile)

/**
 * Every running application that has a visible window, likely games first,
 * each with its own executable icon.
 *
 * Read-only by design: this enumerates, it never launches or touches
 * anything. PowerShell rather than a native module keeps the dependency count
 * at zero — Get-Process is the only thing Windows ships that hands back window
 * title and full image path together.
 */
export async function listRunningApps(): Promise<DetectedApp[]> {
  let raw: RawProcess[] = []
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object Id,ProcessName,MainWindowTitle,Path | ConvertTo-Json -Compress"
      ],
      { windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 15_000 }
    )
    const parsed: unknown = JSON.parse(stdout || '[]')
    // ConvertTo-Json emits a bare object, not an array, when there is exactly
    // one match — a real case on a machine with only the game open.
    raw = Array.isArray(parsed) ? (parsed as RawProcess[]) : [parsed as RawProcess]
  } catch {
    return [] // no PowerShell, timeout, malformed JSON — an empty picker, not a crash
  }

  return Promise.all(
    filterAndRank(raw, process.execPath).map(async (p) => ({
      ...p,
      iconDataUrl: await fileIconOrNull(p.exePath)
    }))
  )
}

async function fileIconOrNull(exePath: string): Promise<string | null> {
  try {
    const icon = await app.getFileIcon(exePath, { size: 'large' })
    return icon.isEmpty() ? null : icon.toDataURL()
  } catch {
    return null // a missing icon is a cosmetic loss, not a reason to hide the app
  }
}
