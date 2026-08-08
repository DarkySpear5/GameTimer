import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface Shortcut {
  name: string
  target: string
  args: string
}

/**
 * Start Menu and Desktop shortcuts, with their target and arguments.
 *
 * This exists because some launchers only record how to start a game in the
 * shortcut they create. Measured on 2026-08-08: Vindictus's game id (10300)
 * appears in `nxl://launch/10300` inside its .lnk and NOWHERE else — not in
 * the Nexon launcher's config, not in its registry keys, not in the install
 * folder. The shortcut is the launcher's own statement of "this is how you
 * start this game", which makes it the most authoritative source available.
 *
 * PowerShell + WScript.Shell rather than a .lnk binary parser, matching how
 * processList.ts already reaches Windows — it keeps the dependency count at
 * zero and .lnk is a format worth not reimplementing.
 *
 * Read-only, and failure is always an empty list rather than an error: a
 * machine with no shortcuts is normal, not broken.
 */
export async function listShortcuts(): Promise<Shortcut[]> {
  // Single-quoted PowerShell literals throughout, and no interpolation of
  // anything caller-supplied — this command is a fixed string.
  const script = [
    "$sh = New-Object -ComObject WScript.Shell;",
    "$dirs = @(\"$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\", \"$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\", \"$env:USERPROFILE\\Desktop\", \"$env:PUBLIC\\Desktop\");",
    'Get-ChildItem $dirs -Recurse -Filter *.lnk -ErrorAction SilentlyContinue |',
    'ForEach-Object { try { $l = $sh.CreateShortcut($_.FullName);',
    '[PSCustomObject]@{ name = [System.IO.Path]::GetFileNameWithoutExtension($_.Name); target = $l.TargetPath; args = $l.Arguments } } catch {} } |',
    'ConvertTo-Json -Compress'
  ].join(' ')

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 30_000 }
    )
    const parsed: unknown = JSON.parse(stdout || '[]')
    // ConvertTo-Json emits a bare object, not an array, for a single match.
    const list = Array.isArray(parsed) ? parsed : [parsed]
    return list
      .filter((s): s is Shortcut => !!s && typeof (s as Shortcut).name === 'string')
      .map((s) => ({ name: s.name ?? '', target: s.target ?? '', args: s.args ?? '' }))
  } catch {
    return []
  }
}

/**
 * The launcher URI a shortcut starts the game with, if it uses one.
 *
 * Measured formats:
 *   nxl://launch/10300                      Nexon      (Vindictus)
 *   com.epicgames.launcher://apps/...       Epic
 *   battlenet://heroes                      Battle.net
 *   steam://rungameid/413150                Steam
 *
 * Anything else — a shortcut straight to an .exe, which is what Blizzard and
 * GOG create — returns null, and the caller falls back to the executable.
 */
const LAUNCH_URI = /\b((?:nxl|steam|battlenet|goggalaxy|com\.epicgames\.launcher|origin2|link2ea):\/\/\S+)/i

export function launchUriFromArgs(args: string): string | null {
  const match = LAUNCH_URI.exec(args)
  return match ? match[1].replace(/["']+$/, '') : null
}
