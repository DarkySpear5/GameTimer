import { promises as fs } from 'fs'
import { join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import {
  dedupeLibraryRoots,
  matchExeToGame,
  parseAppManifest,
  parseLibraryFolders,
  type SteamGame
} from './steamVdf'

const execFileAsync = promisify(execFile)

/** Where Steam installs by default, tried only if the registry says nothing. */
const FALLBACK_STEAM_PATHS = ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam']

let cache: { games: SteamGame[]; at: number } | null = null
const CACHE_MS = 60_000

/**
 * Steam's own install root, from the registry key it maintains. `reg.exe`
 * rather than a native module — Node cannot read the registry on its own and
 * this keeps the dependency count at zero.
 */
async function findSteamRoot(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'reg.exe',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
      { windowsHide: true, timeout: 10_000 }
    )
    const m = /SteamPath\s+REG_SZ\s+(.+)/i.exec(stdout)
    if (m) return m[1].trim().replace(/\//g, '\\')
  } catch {
    // no Steam, no registry access — fall through to the defaults
  }
  for (const p of FALLBACK_STEAM_PATHS) {
    try {
      await fs.access(p)
      return p
    } catch {
      /* not here */
    }
  }
  return null
}

/**
 * Every game currently installed through Steam, across every library folder.
 *
 * Cached for a minute: the Add Game picker can resolve several candidates in a
 * row, and re-reading every .acf on disk each time would be wasteful for data
 * that only changes when something is installed or removed.
 *
 * `force` skips that cache. The installed-games scan uses it, because there the
 * cache is actively wrong: someone who installs a game and then asks Gamut to
 * look for it would be told it isn't there. That scan is a rare, deliberate
 * action reading a dozen small files, so it can afford to be exact.
 */
export async function scanSteamLibrary(force = false): Promise<SteamGame[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.games

  const games: SteamGame[] = []
  const root = await findSteamRoot()
  if (!root) {
    cache = { games, at: Date.now() }
    return games
  }

  // The root itself is always a library; libraryfolders.vdf lists any others.
  // Deduped case-insensitively — the registry and the vdf routinely disagree
  // about capitalisation for the same folder. See dedupeLibraryRoots.
  const discovered = [root]
  try {
    const vdf = await fs.readFile(join(root, 'steamapps', 'libraryfolders.vdf'), 'utf-8')
    discovered.push(...parseLibraryFolders(vdf))
  } catch {
    /* single-library install, or Steam has never run */
  }
  const roots = dedupeLibraryRoots(discovered)

  for (const libraryRoot of roots) {
    const steamapps = join(libraryRoot, 'steamapps')
    let entries: string[]
    try {
      entries = await fs.readdir(steamapps)
    } catch {
      continue // library folder listed but the drive is not mounted
    }
    for (const entry of entries) {
      if (!entry.startsWith('appmanifest_') || !entry.endsWith('.acf')) continue
      try {
        const game = parseAppManifest(await fs.readFile(join(steamapps, entry), 'utf-8'))
        if (game) {
          game.installPath = join(steamapps, 'common', game.installDir)
          games.push(game)
        }
      } catch {
        /* unreadable manifest — skip it, never fail the whole scan */
      }
    }
  }

  // Belt-and-braces on top of the root dedupe: a game moved between library
  // folders can leave a stale appmanifest behind in the old one, so the same
  // appid legitimately appears twice on disk.
  const unique = [...new Map(games.map((g) => [g.appId, g])).values()]
  cache = { games: unique, at: Date.now() }
  return unique
}

/** Exact identity for a Steam-installed game, or null if the exe is not one. */
export async function findByExePath(exePath: string): Promise<SteamGame | null> {
  return matchExeToGame(exePath, await scanSteamLibrary())
}

export type { SteamGame }
