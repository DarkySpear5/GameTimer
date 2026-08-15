import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface RunningProcess {
  /**
   * Null when this process's path could not be read — always true for a
   * process running more elevated than this app (e.g. Vindictus under
   * GameGuard anti-cheat). Windows blocks reading an elevated process's
   * path from an unelevated one; `name` is still readable regardless, so
   * callers needing to identify such a process fall back to it.
   */
  path: string | null
  name: string
  pid: number
}

/**
 * Every running process, with its path when this app is allowed to read it.
 * Previously filtered out any process whose path was unreadable — which
 * silently dropped every elevated, anti-cheat-protected game (Vindictus,
 * found live: GameGuard runs it elevated, so its path came back empty and it
 * never appeared here at all, meaning the watcher could never see it as
 * running). Now every process is kept; `path: null` is itself the signal
 * callers use to fall back to name-only matching — see watchMatch.ts.
 */
export async function listRunningProcesses(): Promise<RunningProcess[]> {
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-Process | Select-Object -Property Path,ProcessName,Id | ConvertTo-Json -Compress'
      ],
      { windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 15_000 }
    )
    const trimmed = stdout.trim()
    if (!trimmed) return []
    const parsed = JSON.parse(trimmed)
    const rows = Array.isArray(parsed) ? parsed : [parsed]
    return rows
      .filter((r) => r && typeof r.ProcessName === 'string' && typeof r.Id === 'number')
      .map((r) => ({
        path: typeof r.Path === 'string' && r.Path.length > 0 ? r.Path.toLowerCase() : null,
        name: String(r.ProcessName).toLowerCase(),
        pid: Number(r.Id)
      }))
  } catch {
    return []
  }
}
