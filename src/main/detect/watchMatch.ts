/**
 * Deciding whether a game is currently running, kept free of `electron` and
 * `fs` so it can be unit-tested — same split as processFilter.ts and
 * matchHit.ts.
 */

/** Only the fields the decision needs, so tests don't build a whole Profile. */
export interface WatchTarget {
  installDir: string | null
  exePath: string | null
  /** Only read by the name-only fallback below, to scope it to specific launchers. */
  launchUri?: string | null
}

/**
 * Launchers confirmed to run their games elevated (anti-cheat), where the
 * name-only fallback below is worth the slightly looser match. Deliberately
 * NOT applied to Steam/GOG/Xbox/EA-without-anti-cheat/manual games — those
 * already work correctly via the path/folder match, and widening the
 * fallback to all of them would only add risk (a shared, generic process
 * name colliding with an unrelated game) for zero benefit.
 */
const NAME_FALLBACK_LAUNCHERS = /^(nxl|battlenet|origin2|link2ea):\/\//i

/**
 * Whether any running process belongs to this game.
 *
 * Matching one exact executable was wrong in two ways, both of which showed up
 * on real games:
 *
 *   - One game is rarely one process. Rocket League starts a launcher that
 *     hands off to the real binary and then EXITS, so the watched exe vanished
 *     mid-session: the timer paused at the second anti-cheat splash and nothing
 *     ever resumed it. Stardew Valley through SMAPI has the same shape.
 *   - A Steam game has no exePath at all, because it launches through
 *     steam://rungameid. Those profiles were skipped by the watcher entirely,
 *     which is why closing a game never stopped its timer.
 *
 * So the unit is the install FOLDER: any process running underneath it means
 * the game is up, whichever executable is currently carrying it. The exact exe
 * remains the fallback for a manually linked game with no folder recorded.
 *
 * A third case, found live on Vindictus: a process protected by kernel-level
 * anti-cheat (GameGuard) runs ELEVATED, and Windows blocks an unelevated
 * process — Gamut — from reading an elevated process's file path at all, so it
 * can never appear in `running`. Its bare NAME is still readable, though
 * (Windows does not hide process existence/name across that boundary, only
 * the path). `runningNamesNoPath` is exactly that: names of processes whose
 * path this app could not resolve, used ONLY as a fallback when there is a
 * `game.exePath` to compare a bare filename against — deliberately narrower
 * than the path/folder match, since a name alone can't prove folder
 * membership the way a full path can.
 */
export function isGameRunning(game: WatchTarget, running: Set<string>, runningNamesNoPath?: Set<string>): boolean {
  if (matchingPaths(game, running).length > 0) return true
  return matchesByNameOnly(game, runningNamesNoPath)
}

/** Windows' Process.ProcessName never carries the ".exe" — normalize both sides the same way to compare. */
function bareExeName(exePath: string): string {
  return (exePath.split(/[\\/]/).pop() ?? exePath).replace(/\.exe$/i, '').toLowerCase()
}

function matchesByNameOnly(game: WatchTarget, runningNamesNoPath: Set<string> | undefined): boolean {
  if (!runningNamesNoPath || runningNamesNoPath.size === 0 || !game.exePath) return false
  if (!game.launchUri || !NAME_FALLBACK_LAUNCHERS.test(game.launchUri)) return false
  return runningNamesNoPath.has(bareExeName(game.exePath))
}

/** Same matching rule as isGameRunning, but returns the paths instead of a boolean — Stop needs the PIDs behind them. */
export function matchingPaths(game: WatchTarget, running: Iterable<string>): string[] {
  const dir = game.installDir?.toLowerCase().replace(/[\\/]+$/, '')
  const exe = game.exePath?.toLowerCase()
  const hits: string[] = []
  for (const path of running) {
    // The trailing separator matters: without it "C:\Games\Portal" would also
    // match a process inside "C:\Games\Portal 2".
    if ((dir && path.startsWith(dir + '\\')) || (exe && path === exe)) hits.push(path)
  }
  return hits
}
