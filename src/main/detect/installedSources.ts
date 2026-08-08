import { promises as fs } from 'fs'
import { join } from 'path'
import { regSubkeys, regValues, regKeyName, regTree, type RegKey } from '../util/registry'
import { scanSteamLibrary } from './steamLibrary'
import type { FoundGame } from '@shared/types'

/**
 * Where installed games come from, one scanner per launcher.
 *
 * Every one of these was written only after opening the real thing on a real
 * machine — the roadmap's §5.3 lesson (a .exe's ProductName was right 5 times,
 * empty 3 and actively WRONG 4) is why nothing here is written from
 * documentation alone. What was actually measured on 2026-08-08:
 *
 *   Steam      10 games, plus "Steamworks Common Redistributables" to filter
 *   Epic       Rocket League, plus 3 Unreal Engine entries sharing namespace "ue"
 *   GOG        Forager, with an ABSOLUTE exe path rather than one relative to `path`
 *   Nexon      Vindictus under C:\Nexon\Library, binary 3 levels down; the
 *              HKCU keys are settings, not installs
 *   Xbox       C:\XboxGames present, no game installed -> parser unverified
 *   Battle.net installed, no game -> parser unverified (launcher entry read OK)
 *   EA         installed, no game -> parser unverified
 *
 * The unverified scanners return nothing on a machine with no such games, which
 * is the correct answer here and a safe failure mode everywhere else. Anything
 * any of them finds is offered for confirmation, never applied silently.
 */

const EPIC_MANIFESTS = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests'

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

/**
 * Epic writes one JSON .item per installed thing. Measured: of four manifests,
 * three were Unreal Engine tooling (Unreal Engine itself, Quixel Bridge, the
 * Fab plugin) — all sharing `CatalogNamespace: "ue"`, and two with an empty
 * LaunchExecutable. Both signals are needed: the engine DOES have a launch
 * executable, so the namespace is what separates a game from a tool.
 */
export async function scanEpic(): Promise<FoundGame[]> {
  let entries: string[]
  try {
    entries = (await fs.readdir(EPIC_MANIFESTS)).filter((f) => f.endsWith('.item'))
  } catch {
    return [] // Epic not installed
  }

  const games: FoundGame[] = []
  for (const entry of entries) {
    try {
      const raw = JSON.parse(await fs.readFile(join(EPIC_MANIFESTS, entry), 'utf-8'))
      const name: string = raw.DisplayName ?? ''
      const location: string = raw.InstallLocation ?? ''
      const launch: string = raw.LaunchExecutable ?? ''
      if (!name || !location || !launch) continue
      if (raw.CatalogNamespace === 'ue') continue // Unreal Engine tooling, not a game

      const exePath = join(location, launch.replace(/\//g, '\\'))
      games.push({
        id: `epic:${raw.AppName ?? name}`,
        name,
        source: 'epic',
        exePath: (await fileExists(exePath)) ? exePath : null,
        steamAppId: null,
        launchUri: null,
        confident: true
      })
    } catch {
      /* one unreadable manifest must never fail the whole scan */
    }
  }
  return games
}

/**
 * GOG registers each installed game under its own product-id key, carrying a
 * display name, an install path and the executable.
 *
 * VERIFIED 2026-08-08 against a real install — Forager:
 *
 *   key      2106942030
 *   gameName Forager
 *   path     C:\Program Files\GOG Galaxy\Games\Forager
 *   exe      C:\Program Files\GOG Galaxy\Games\Forager\Forager.exe
 *
 * Note `exe` came back ABSOLUTE, not relative to `path`, which is why the join
 * below is conditional. Both forms appear in the wild.
 */
export async function scanGog(): Promise<FoundGame[]> {
  const roots = ['HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games', 'HKLM\\SOFTWARE\\GOG.com\\Games']
  const games: FoundGame[] = []
  const seen = new Set<string>()

  for (const root of roots) {
    for (const key of await regSubkeys(root)) {
      const values = await regValues(key)
      const name = values.gameName || values.startMenu || ''
      if (!name || seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())

      const dir = values.path || ''
      const exe = values.exe || ''
      // `exe` is sometimes already absolute and sometimes relative to `path`.
      const exePath = exe ? (exe.includes(':\\') ? exe : dir ? join(dir, exe) : '') : ''
      games.push({
        id: `gog:${regKeyName(key)}`,
        name,
        source: 'gog',
        exePath: exePath && (await fileExists(exePath)) ? exePath : null,
        steamAppId: null,
        launchUri: null,
        confident: true
      })
    }
  }
  return games
}

/**
 * Xbox / Microsoft Store games install into C:\XboxGames\<Game>\Content.
 *
 * UNVERIFIED against real data: the folder exists on the development machine
 * but holds only "GameSave", so there was nothing to read. The real install
 * folder under Program Files\WindowsApps is ACL-protected and deliberately not
 * touched — XboxGames is the readable one.
 */
export async function scanXbox(): Promise<FoundGame[]> {
  const games: FoundGame[] = []
  // Xbox lets you choose the install drive per game, and it always uses the
  // same folder name at the root of whichever one you picked. Checking every
  // drive letter costs 26 stat calls and removes the need to configure it.
  for (const root of await xboxRoots()) {
    let dirs: string[]
    try {
      dirs = (await fs.readdir(root, { withFileTypes: true }))
        .filter((e) => e.isDirectory() && e.name !== 'GameSave')
        .map((e) => e.name)
    } catch {
      continue
    }
    for (const dir of dirs) {
      const content = join(root, dir, 'Content')
      let exePath: string | null = null
      try {
        const exe = (await fs.readdir(content)).find((f) => f.toLowerCase().endsWith('.exe'))
        if (exe) exePath = join(content, exe)
      } catch {
        /* no Content folder — still offer the game by its folder name */
      }
      games.push({
        id: `xbox:${dir}`,
        name: dir,
        source: 'xbox',
        exePath,
        steamAppId: null,
        launchUri: null,
        confident: true
      })
    }
  }
  return games
}

async function xboxRoots(): Promise<string[]> {
  const found: string[] = []
  await Promise.all(
    driveLetters().map(async (letter) => {
      const root = `${letter}:\\XboxGames`
      if (await fileExists(root)) found.push(root)
    })
  )
  return found.sort()
}

/**
 * Any folder the user points at, for everything the launchers don't cover —
 * a game installed outside its launcher's default drive, a DRM-free copy, an
 * old install, anything.
 *
 * Treats each immediate subdirectory as one game, which is how every launcher
 * on this list lays its games out (`<root>\<Game Name>\...`). Nothing is
 * guessed beyond that: the folder name is the name, and the executable is
 * found by the same heuristic used for the registry-based sources.
 */
export async function scanFolder(
  root: string,
  source: FoundGame['source'] = 'folder'
): Promise<FoundGame[]> {
  let dirs: string[]
  try {
    dirs = (await fs.readdir(root, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  } catch {
    return []
  }

  const games: FoundGame[] = []
  for (const dir of dirs) {
    const full = join(root, dir)
    const exePath = await findGameExe(full, dir)
    // No executable anywhere below it means this probably isn't a game folder
    // at all — offered, but not pre-ticked.
    games.push({
      id: `${source}:${full.toLowerCase()}`,
      name: dir,
      source,
      exePath,
      steamAppId: null,
      launchUri: null,
      confident: exePath != null
    })
  }
  return games
}

/**
 * Nexon games, from two signals that mean different things.
 *
 * 1. `<drive>:\Nexon\Library\<game>` is the real install root, one folder per
 *    game. VERIFIED: Vindictus lives there, with its binary three levels down
 *    at `appdata\en-US\Vindictus.exe`.
 * 2. `HKCU\Software\Nexon\<Game>` keys hold SETTINGS, not installs. Mabinogi's
 *    is a hundred graphics and chat options with no install path anywhere in
 *    it, and a game uninstalled years ago still leaves one behind.
 *
 * So a game found on disk is confident and launchable; a game known only from
 * the registry is offered — it is genuinely something the user plays — but
 * unticked and labelled, because that key is not evidence it is still installed.
 */
const NEXON_NON_GAMES = new Set(['crashreporter', 'ngs', 'nexon launcher', 'nexonplug', 'appdata'])

export async function scanNexon(extraRoots: string[] = []): Promise<FoundGame[]> {
  const games: FoundGame[] = []
  const foundOnDisk = new Set<string>()

  const roots = [...extraRoots]
  for (const letter of driveLetters()) roots.push(`${letter}:\\Nexon\\Library`)

  for (const root of roots) {
    let dirs: string[]
    try {
      dirs = (await fs.readdir(root, { withFileTypes: true }))
        .filter((e) => e.isDirectory() && !NEXON_NON_GAMES.has(e.name.toLowerCase()))
        .map((e) => e.name)
    } catch {
      continue
    }
    for (const dir of dirs) {
      foundOnDisk.add(normalizeLoose(dir))
      games.push({
        id: `nexon:${dir}`,
        // Folder names are lowercase ("vindictus"); the registry spelling is
        // the presentable one, so prefer it when the two describe the same game.
        name: dir,
        source: 'nexon',
        exePath: await findGameExe(join(root, dir), dir),
        steamAppId: null,
        launchUri: null,
        confident: true
      })
    }
  }

  for (const key of await regSubkeys('HKCU\\Software\\Nexon')) {
    const name = regKeyName(key)
    if (!name || NEXON_NON_GAMES.has(name.toLowerCase())) continue
    if (foundOnDisk.has(normalizeLoose(name))) continue
    games.push({
      id: `nexon:${name}`,
      name,
      source: 'nexon',
      exePath: null,
      steamAppId: null,
      launchUri: null,
      confident: false
    })
  }

  return games
}

const normalizeLoose = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** C: through Z:. A: and B: are floppy letters and best left alone. */
function driveLetters(): string[] {
  return 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
}

/**
 * Executables that are never the game, only things that sit beside it.
 * Deliberately conservative — a missed filter shows one extra row the user can
 * untick, while an over-eager one hides the actual game.
 */
const NOT_A_GAME_EXE =
  /(unins|uninstall|setup|installer|redist|vcredist|directx|dxsetup|dotnet|vc_|crashpad|crashhandler|crashreport|touchup|helper|updater|patcher|launcher_helper|cleanup|report|service|activation)/i

/** Folders that never hold the game binary and can be enormous. */
const SKIP_DIRS = /^(patchdata|redist|_?commonredist|directx|dotnet|vcredist|support|manual|soundtrack|extras|save[sd]?|logs?|cache|temp|tmp|node_modules)$/i

/** How far below an install root to look, and how many folders to open at most. */
const MAX_EXE_DEPTH = 4
const MAX_DIRS_SCANNED = 400

/**
 * The most plausible game executable inside an install folder.
 *
 * A bounded recursive walk rather than a list of likely subfolders, because the
 * measured reality defeats any such list: Vindictus's binary sits at
 * `<install>\appdata\en-US\Vindictus.exe`, three levels down, beside
 * `bcdedit.exe`, `bugreport.exe`, `srcds.exe` and `NMService.exe`. Depth and
 * folder count are capped so a badly chosen folder can't turn a scan into a
 * full-disk crawl.
 *
 * Ranking: a filename resembling the game's name wins outright — that is what
 * picks Vindictus.exe out of that pile — and the largest remaining binary wins
 * otherwise, since a game's main executable is essentially always the biggest
 * thing that isn't an installer or a crash handler.
 */
export async function findGameExe(dir: string, gameName: string): Promise<string | null> {
  const wanted = gameName.toLowerCase().replace(/[^a-z0-9]/g, '')
  const candidates: { path: string; size: number; match: boolean; depth: number }[] = []
  let dirsScanned = 0
  // A single flag rather than returning early, because `return` only unwinds
  // ONE frame — the parent's loop would carry straight on to the next sibling
  // folder and keep walking the whole install after the answer was already
  // found. On a large game that is the difference between milliseconds and
  // tens of seconds.
  let done = false

  async function walk(current: string, depth: number): Promise<void> {
    if (done || depth > MAX_EXE_DEPTH || dirsScanned >= MAX_DIRS_SCANNED) return
    dirsScanned++

    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      return
    }

    const subdirs: string[] = []
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.test(entry.name)) subdirs.push(entry.name)
        continue
      }
      if (!entry.name.toLowerCase().endsWith('.exe')) continue
      if (NOT_A_GAME_EXE.test(entry.name)) continue
      const path = join(current, entry.name)
      try {
        const stat = await fs.stat(path)
        const stem = entry.name.slice(0, -4).toLowerCase().replace(/[^a-z0-9]/g, '')
        candidates.push({
          path,
          size: stat.size,
          match: !!stem && !!wanted && (wanted.includes(stem) || stem.includes(wanted)),
          depth
        })
      } catch {
        /* vanished between readdir and stat */
      }
    }

    // An exact name match is as good as it gets — stop the whole walk.
    if (candidates.some((c) => c.match)) {
      done = true
      return
    }
    for (const sub of subdirs) {
      if (done) return
      await walk(join(current, sub), depth + 1)
    }
  }

  await walk(dir, 0)
  if (!candidates.length) return null
  candidates.sort(
    (a, b) => Number(b.match) - Number(a.match) || a.depth - b.depth || b.size - a.size
  )
  return candidates[0].path
}

/**
 * Games from Windows' uninstall registry, filtered to one publisher.
 *
 * This is how Battle.net and EA games are found, and it is deliberately not a
 * per-game key guess: measured on 2026-08-08, Blizzard's own launcher entry
 * carries DisplayName "Battle.net", Publisher "Blizzard Entertainment" and
 * InstallLocation "C:\Program Files (x86)\Battle.net" — the exact three fields
 * needed. Their games register the same way.
 *
 * The whole hive is read in one call (see regTree) because there are ~250
 * entries and a query each would take seconds.
 *
 * UNVERIFIED against an actual game: both launchers are installed on the
 * development machine with no games in them, so only the launcher entries were
 * available to read — and those are excluded by name.
 */
const UNINSTALL_HIVES = [
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
]

/**
 * The uninstall hives, read at most once per scan.
 *
 * Measured at ~1.9s and ~1.3s for the two hives, and both Battle.net and EA
 * need the same data — reading them per-publisher meant four full reads where
 * two will do. Cleared between scans so a game installed since the last one
 * still shows up.
 */
let uninstallCache: RegKey[] | null = null

export function clearUninstallCache(): void {
  uninstallCache = null
}

async function uninstallEntries(): Promise<RegKey[]> {
  if (!uninstallCache) {
    const trees = await Promise.all(UNINSTALL_HIVES.map((hive) => regTree(hive)))
    uninstallCache = trees.flat()
  }
  return uninstallCache
}

async function scanUninstallByPublisher(
  publisher: RegExp,
  source: FoundGame['source'],
  excludeNames: RegExp
): Promise<FoundGame[]> {
  const games: FoundGame[] = []
  const seen = new Set<string>()
  {
    for (const { key, values } of await uninstallEntries()) {
      const name = values.DisplayName ?? ''
      const location = values.InstallLocation ?? ''
      if (!name || !location) continue
      if (!publisher.test(values.Publisher ?? '')) continue
      if (excludeNames.test(name)) continue // the launcher itself, not a game
      if (seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())

      games.push({
        id: `${source}:${regKeyName(key)}`,
        name,
        source,
        exePath: (await fileExists(location)) ? await findGameExe(location, name) : null,
        steamAppId: null,
        launchUri: null,
        confident: true
      })
    }
  }
  return games
}

export function scanBattleNet(): Promise<FoundGame[]> {
  return scanUninstallByPublisher(/blizzard/i, 'battlenet', /^battle\.net$|^blizzard app$/i)
}

export function scanEa(): Promise<FoundGame[]> {
  return scanUninstallByPublisher(
    /electronic arts|^ea\b/i,
    'ea',
    /^(ea app|ea desktop|origin|ea play)$/i
  )
}

/** Steam, in the same shape as the rest. The filtering lives in installedGames.ts. */
export async function scanSteam(): Promise<FoundGame[]> {
  const games = await scanSteamLibrary(true)
  return games.map((g) => ({
    id: `steam:${g.appId}`,
    name: g.name,
    source: 'steam' as const,
    // Launching goes through steam://rungameid, which is why no exe is needed
    // and why it is the correct route anyway — Steam applies launch options.
    exePath: null,
    steamAppId: g.appId,
    launchUri: null,
    confident: true
  }))
}
