import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { readdir } from 'fs/promises'
import { join } from 'path'
import os from 'os'

const execFileAsync = promisify(execFile)

// Inno Setup's AppId from v1's installer.iss — Inno always writes an
// InstallLocation value here on install, regardless of whether the user
// ever enabled run-at-startup, making it the most reliable signal (more
// reliable than the startup Run key, which only exists if they opted in).
const INNO_UNINSTALL_KEY =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{563FEB11-9CE2-4DFB-BA99-B87775E93449}_is1'

async function findViaRegistry(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('reg', ['query', INNO_UNINSTALL_KEY, '/v', 'InstallLocation'])
    const match = stdout.match(/InstallLocation\s+REG_SZ\s+(.+)/i)
    if (!match) return null
    const dir = match[1].trim().replace(/\\+$/, '')
    const dataFile = join(dir, 'game_timer_data.json')
    return existsSync(dataFile) ? dataFile : null
  } catch {
    // Key doesn't exist — not installed via the v1 Inno installer, or already uninstalled.
    return null
  }
}

function findViaDefaultPath(): string | null {
  const dataFile = join(os.homedir(), 'AppData', 'Local', 'Programs', 'GameTimer', 'game_timer_data.json')
  return existsSync(dataFile) ? dataFile : null
}

async function findViaScan(): Promise<string | null> {
  const programsDir = join(os.homedir(), 'AppData', 'Local', 'Programs')
  try {
    const entries = await readdir(programsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const dataFile = join(programsDir, entry.name, 'game_timer_data.json')
      if (existsSync(dataFile)) return dataFile
    }
  } catch {
    // Programs dir may not exist on this machine
  }
  return null
}

/**
 * Best-effort auto-detection of a v1 install's data file. A user who moved
 * the v1 folder post-install with autostart never enabled has no automatic
 * signal at all — that's what the manual "browse for the file" fallback in
 * the Settings UI is for; this function only covers the automatic path.
 */
export async function locateLegacyDataFile(): Promise<string | null> {
  return (await findViaRegistry()) ?? findViaDefaultPath() ?? (await findViaScan())
}
