/**
 * Deciding whether a game is currently running, kept free of `electron` and
 * `fs` so it can be unit-tested — same split as processFilter.ts and
 * matchHit.ts.
 */

/** Only the fields the decision needs, so tests don't build a whole Profile. */
export interface WatchTarget {
  installDir: string | null
  exePath: string | null
  /** No longer read by the matching logic itself — see isElevatedNameMatch's doc comment for why the launcher-scoped gate that used to read this was removed. Kept on the interface since callers still carry it around for other purposes (e.g. launching). */
  launchUri?: string | null
  /** Only read by the name-only fallback, as a second reference alongside exePath's bare name — see isElevatedNameMatch. */
  name?: string
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
 *
 * This fallback used to only apply to a hardcoded allowlist of launcher URI
 * schemes (Nexon/Battle.net/EA), on the theory that every other launcher
 * already worked fine via the path/folder match. Found live to be false on
 * Rocket League (Epic, launchUri null): its launcher stub is unelevated and
 * matches normally, but the real binary runs under EasyAntiCheat, which also
 * reports an empty path — confirmed via a real Get-Process showing both
 * RocketLeague.exe and EasyAntiCheat_EOS with Path "". The allowlist gate
 * meant this fell through anyway, so the timer paused the instant the splash
 * screen ended and the anti-cheat-protected process took over. Anti-cheat
 * elevation isn't a property of the LAUNCHER, it's a property of the GAME, so
 * scoping this to specific launchers was never the right axis — removed.
 */
export function isGameRunning(game: WatchTarget, running: Set<string>, runningNamesNoPath?: Set<string>): boolean {
  if (matchingPaths(game, running).length > 0) return true
  return isElevatedNameMatch(game, runningNamesNoPath)
}

/** Windows' Process.ProcessName never carries the ".exe" — normalize both sides the same way to compare. */
function bareExeName(exePath: string): string {
  return (exePath.split(/[\\/]/).pop() ?? exePath).replace(/\.exe$/i, '').toLowerCase()
}

/** Same normalize-and-strip-punctuation rule findGameExe (installedSources.ts) already uses to compare a game's title against a candidate exe's filename stem. */
function normalizeForNameMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Whether this game is currently "running" ONLY via the elevated name-only
 * fallback — never via a resolvable path. Exported (not just used internally
 * by isGameRunning) so gameWatcher can tag a game it detects this way as
 * unstoppable: this app can see the process exists, but Windows blocks it
 * from ever reading enough about an elevated process to kill it, so the
 * renderer disables Stop for it rather than offering a button that would
 * just silently fail — see gameWatcher.unstoppableNames and LibraryDetail.tsx.
 *
 * A second gap, also found live on Rocket League: `game.exePath` is not
 * always a usable reference for the bare-name comparison either. Its stored
 * exePath is the launcher stub ("Launcher.exe"), which starts, matches
 * normally, then exits and hands off to the real binary
 * ("RocketLeague.exe") — a completely different name, so comparing against
 * `bareExeName(game.exePath)` alone can never match the real one once it's
 * the only thing left running. What the real process name DOES resemble is
 * the game's own TITLE, so this also tries a normalized substring match
 * against `game.name` — the exact same normalize-and-compare heuristic
 * findGameExe (installedSources.ts) already uses to pick an exe out of a
 * folder by resemblance to the game's name, applied here in the other
 * direction (a live process name found by resemblance to the game's name).
 */
export function isElevatedNameMatch(game: WatchTarget, runningNamesNoPath: Set<string> | undefined): boolean {
  if (!runningNamesNoPath || runningNamesNoPath.size === 0) return false
  if (game.exePath && runningNamesNoPath.has(bareExeName(game.exePath))) return true

  const wanted = game.name ? normalizeForNameMatch(game.name) : ''
  if (!wanted) return false
  for (const procName of runningNamesNoPath) {
    const stem = normalizeForNameMatch(procName)
    if (stem && (wanted.includes(stem) || stem.includes(wanted))) return true
  }
  return false
}

/**
 * Everything after `installDir\Content\` in the profile's own exePath, for an
 * Xbox/GDK-shaped install (`<XboxGames root>\<Game>\Content\...`) — or null if
 * the profile isn't shaped that way at all (no installDir, no exePath, or the
 * exe isn't under a Content folder directly below installDir).
 *
 * This is what a live, package-virtualized process path can still be matched
 * against — see matchingPaths' own doc comment for why the two full paths
 * never share a prefix.
 */
function contentRelativePath(game: WatchTarget): string | null {
  if (!game.installDir || !game.exePath) return null
  const prefix = game.installDir.toLowerCase().replace(/[\\/]+$/, '') + '\\content\\'
  const exe = game.exePath.toLowerCase()
  return exe.startsWith(prefix) ? exe.slice(prefix.length) : null
}

/**
 * Same matching rule as isGameRunning, but returns the paths instead of a boolean — Stop needs the PIDs behind them.
 *
 * A third case, found live on Indika (a PC Game Pass / GDK title): the game is
 * installed at `C:\XboxGames\INDIKA\Content\...`, exactly what installDir and
 * exePath record — but the RUNNING process's own path, as Windows reports it,
 * is `C:\Program Files\WindowsApps\<PackageFamilyName>\...` instead. Neither
 * folder-prefix nor exact-exe matching can ever succeed there: it isn't a
 * permissions problem (unlike the elevated case below), the live path is
 * simply a different string for the same bytes, because GDK/Store packaging
 * presents a virtualized package-identity view to Get-Process. The one thing
 * shared between the real and virtualized paths is everything after
 * `\Content\`, which is identical either way — see contentRelativePath.
 */
export function matchingPaths(game: WatchTarget, running: Iterable<string>): string[] {
  const dir = game.installDir?.toLowerCase().replace(/[\\/]+$/, '')
  const exe = game.exePath?.toLowerCase()
  const rel = contentRelativePath(game)
  const hits: string[] = []
  for (const path of running) {
    // The trailing separator matters: without it "C:\Games\Portal" would also
    // match a process inside "C:\Games\Portal 2".
    if (
      (dir && path.startsWith(dir + '\\')) ||
      (exe && path === exe) ||
      (rel && path.endsWith('\\' + rel))
    ) {
      hits.push(path)
    }
  }
  return hits
}
