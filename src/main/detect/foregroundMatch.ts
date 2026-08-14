import { isGameRunning } from './watchMatch'

/**
 * Deciding which tracked, linked game (if any) the OS-focused window belongs
 * to. Kept free of `electron`/`child_process`, same split as watchMatch.ts,
 * so the matching rule itself can be unit-tested without shelling out to
 * PowerShell — see foregroundWindow.ts for the actual OS query.
 */

/** Screen pixels, straight from PowerShell's GetWindowRect — not DPI-scaled. */
export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ForegroundWindowInfo {
  exePath: string
  title: string
  bounds: WindowBounds
}

/** Only the fields the matching rule needs, so tests don't build a whole Profile. */
export interface RunningCandidate {
  name: string
  installDir: string | null
  exePath: string | null
}

/**
 * Parses the JSON object foregroundWindow.ts's PowerShell script prints.
 * Returns null for anything that isn't a well-formed result — a missing or
 * empty ExePath (no Get-Process resolved, or access denied) is treated the
 * same as "nothing is focused" rather than a partial result, since a
 * foreground window this can't attribute to an exe can never match a profile.
 */
export function parseForegroundWindowJson(raw: string): ForegroundWindowInfo | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>
  const { ExePath: exePath, Title: title, X: x, Y: y, Width: width, Height: height } = obj
  if (
    typeof exePath !== 'string' ||
    exePath.length === 0 ||
    typeof title !== 'string' ||
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number'
  ) {
    return null
  }
  return { exePath, title, bounds: { x, y, width, height } }
}

/**
 * Same install-folder-or-exact-exe rule as watchMatch.ts's isGameRunning,
 * reused rather than reimplemented — "is this game running" (the background
 * watcher) and "is this game focused" (this) can never quietly disagree on
 * what counts as a match.
 */
export function matchForegroundToRunning(exePath: string, candidates: RunningCandidate[]): string | null {
  const focused = new Set([exePath.toLowerCase()])
  for (const candidate of candidates) {
    if (isGameRunning({ installDir: candidate.installDir, exePath: candidate.exePath }, focused)) {
      return candidate.name
    }
  }
  return null
}
