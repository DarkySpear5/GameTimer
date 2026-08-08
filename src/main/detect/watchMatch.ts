/**
 * Deciding whether a game is currently running, kept free of `electron` and
 * `fs` so it can be unit-tested — same split as processFilter.ts and
 * matchHit.ts.
 */

/** Only the two fields the decision needs, so tests don't build a whole Profile. */
export interface WatchTarget {
  installDir: string | null
  exePath: string | null
}

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
 */
export function isGameRunning(game: WatchTarget, running: Set<string>): boolean {
  const dir = game.installDir?.toLowerCase().replace(/[\\/]+$/, '')
  if (dir) {
    // The trailing separator matters: without it "C:\Games\Portal" would also
    // match a process inside "C:\Games\Portal 2".
    const prefix = dir + '\\'
    for (const path of running) if (path.startsWith(prefix)) return true
  }
  return game.exePath ? running.has(game.exePath.toLowerCase()) : false
}
