import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface RunningProcess {
  path: string
  pid: number
}

/**
 * Every running process with a resolvable path, plus its PID — the PID is
 * only needed to stop a game later, so it stays out of gameWatcher's hot poll
 * unless something asks for it.
 */
export async function listRunningProcesses(): Promise<RunningProcess[]> {
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-Process | Where-Object { $_.Path } | Select-Object -Property Path,Id | ConvertTo-Json -Compress'
      ],
      { windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 15_000 }
    )
    const trimmed = stdout.trim()
    if (!trimmed) return []
    const parsed = JSON.parse(trimmed)
    const rows = Array.isArray(parsed) ? parsed : [parsed]
    return rows
      .filter((r) => r && typeof r.Path === 'string' && typeof r.Id === 'number')
      .map((r) => ({ path: String(r.Path).toLowerCase(), pid: Number(r.Id) }))
  } catch {
    return []
  }
}
