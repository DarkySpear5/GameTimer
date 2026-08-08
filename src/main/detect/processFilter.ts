/**
 * The pure half of process detection: which running windows are worth showing
 * and in what order. Deliberately free of any `electron` import so it can be
 * unit-tested without an Electron runtime — processList.ts is the thin shell
 * that actually spawns PowerShell and fetches icons.
 */

/** Shape PowerShell hands back, before any filtering. */
export interface RawProcess {
  Id: number
  ProcessName: string
  MainWindowTitle: string
  Path: string | null
}

export interface RankedProcess {
  pid: number
  processName: string
  title: string
  exePath: string
  /** True when the exe sits under a known game-library root — these sort first. */
  likelyGame: boolean
}

/**
 * Launchers, browsers, chat apps and Windows shell surfaces. These have real
 * windows and would otherwise dominate a list whose whole job is "point at the
 * game you're playing". Matched case-insensitively against the process name.
 */
const NOT_GAMES = new Set([
  'explorer',
  'chrome',
  'msedge',
  'msedgewebview2',
  'firefox',
  'brave',
  'opera',
  'discord',
  'slack',
  'teams',
  'spotify',
  'steam',
  'steamwebhelper',
  'epicgameslauncher',
  'galaxyclient',
  'battle.net',
  'eadesktop',
  'ubisoftconnect',
  'upc',
  'textinputhost',
  'applicationframehost',
  'systemsettings',
  'shellexperiencehost',
  'searchhost',
  'lockapp',
  'widgets',
  'code',
  'devenv',
  'notepad',
  'gamut',
  'gamut dev'
])

/**
 * Where games actually live. Used only to rank — anything not matching still
 * appears, just further down, because plenty of games install elsewhere.
 */
const GAME_ROOTS = [
  '\\steamapps\\common\\',
  '\\epic games\\',
  '\\gog galaxy\\games\\',
  '\\gog games\\',
  '\\origin games\\',
  '\\ea games\\',
  '\\ubisoft\\',
  '\\battle.net\\',
  '\\xboxgames\\'
]

export function isLikelyGame(exePath: string): boolean {
  const lower = exePath.toLowerCase()
  return GAME_ROOTS.some((root) => lower.includes(root))
}

/**
 * Drops anything with no resolvable path (access-denied system processes) or
 * no window title (background services), then the denylist, then sorts likely
 * games first and alphabetically within each group.
 */
export function filterAndRank(raw: RawProcess[], selfExePath?: string): RankedProcess[] {
  const seen = new Set<string>()
  // Excluded by PATH, not by name. The name denylist catches "Gamut.exe" in a
  // packaged build but misses development runs, where the process is called
  // "electron" — and it listed itself in the picker as a result.
  const self = selfExePath?.toLowerCase()
  return raw
    .filter((p) => p.Path && p.MainWindowTitle && !NOT_GAMES.has(p.ProcessName.toLowerCase()))
    .filter((p) => !self || p.Path!.toLowerCase() !== self)
    .filter((p) => {
      // One tile per executable: Electron and Chromium games spawn several
      // windowed helper processes off the same binary.
      const key = p.Path!.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((p) => ({
      pid: p.Id,
      processName: p.ProcessName,
      title: p.MainWindowTitle,
      exePath: p.Path!,
      likelyGame: isLikelyGame(p.Path!)
    }))
    .sort((a, b) => {
      if (a.likelyGame !== b.likelyGame) return a.likelyGame ? -1 : 1
      return a.title.localeCompare(b.title)
    })
}
