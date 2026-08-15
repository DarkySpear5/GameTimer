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
  /**
   * Null when the focused window's process is running more elevated than
   * this app and its path couldn't be read (an anti-cheat-protected game —
   * Vindictus under GameGuard, found live). `processName` is the fallback
   * identifier for exactly that case; see matchForegroundToRunning.
   */
  exePath: string | null
  processName: string
  title: string
  bounds: WindowBounds
}

/** Only the fields the matching rule needs, so tests don't build a whole Profile. */
export interface RunningCandidate {
  name: string
  installDir: string | null
  exePath: string | null
  /** Only read by the name-only fallback, to scope it to specific launchers — see watchMatch.ts. */
  launchUri?: string | null
}

/**
 * Parses the JSON object foregroundWindow.ts's PowerShell script prints.
 * Returns null for anything that isn't a well-formed result. ExePath may
 * legitimately be empty (an elevated process this app can't read the path
 * of) — that's still a valid, resolvable window, just one that can only be
 * matched by name — so only a missing ProcessName (nothing could be
 * resolved at all) is treated as "nothing is focused".
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
  const { ExePath: exePath, ProcessName: processName, Title: title, X: x, Y: y, Width: width, Height: height } = obj
  if (
    (exePath !== undefined && exePath !== null && typeof exePath !== 'string') ||
    typeof processName !== 'string' ||
    processName.length === 0 ||
    typeof title !== 'string' ||
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number'
  ) {
    return null
  }
  return {
    exePath: typeof exePath === 'string' && exePath.length > 0 ? exePath : null,
    processName,
    title,
    bounds: { x, y, width, height }
  }
}

/**
 * Same install-folder-or-exact-exe rule as watchMatch.ts's isGameRunning,
 * reused rather than reimplemented — "is this game running" (the background
 * watcher) and "is this game focused" (this) can never quietly disagree on
 * what counts as a match.
 */
export function matchForegroundToRunning(
  focusedWindow: { exePath: string | null; processName: string },
  candidates: RunningCandidate[]
): string | null {
  const focusedPaths = focusedWindow.exePath ? new Set([focusedWindow.exePath.toLowerCase()]) : new Set<string>()
  const focusedNamesNoPath = focusedWindow.exePath
    ? undefined
    : new Set([focusedWindow.processName.toLowerCase()])
  for (const candidate of candidates) {
    const target = { installDir: candidate.installDir, exePath: candidate.exePath, launchUri: candidate.launchUri }
    if (isGameRunning(target, focusedPaths, focusedNamesNoPath)) {
      return candidate.name
    }
  }
  return null
}
