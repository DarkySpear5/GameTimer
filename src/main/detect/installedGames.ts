import { normalizeGameName } from './matchHit'
import { listShortcuts, launchUriFromArgs } from './shortcuts'
import { dataStore } from '../store/dataStore'
import { profileService } from '../store/profileService'
import {
  scanSteam,
  scanEpic,
  scanGog,
  scanXbox,
  scanBattleNet,
  scanEa,
  scanNexon,
  scanFolder,
  clearUninstallCache
} from './installedSources'
import type { FoundGame, GameSource, InstalledGame } from '@shared/types'

/**
 * Adding the games already installed on this PC, without making the user find
 * each one in a picker.
 *
 * The per-launcher scanning lives in installedSources.ts; this decides what
 * counts as a game, what is already known, and what an imported profile looks
 * like.
 */

/**
 * Steam ships tools through the same appmanifest mechanism as games, so they
 * turn up in a library scan looking exactly like one.
 *
 * 228980 was MEASURED on a real machine — "Steamworks Common Redistributables"
 * sat in an 11-entry library. The rest are the well-known runtimes that appear
 * for the same reason; each one that shows up in "Gamut found N games" makes
 * the feature look broken.
 */
const NON_GAME_APP_IDS = new Set([
  228980, // Steamworks Common Redistributables  (measured)
  1070560, // Steam Linux Runtime
  1391110, // Steam Linux Runtime - Soldier
  1628350, // Steam Linux Runtime - Sniper
  1493710, // Proton Experimental
  250820 // SteamVR
])

/**
 * Names that describe a runtime rather than a game. A safety net for tools not
 * caught by appid — deliberately narrow, because a false positive here silently
 * hides a real game, which is worse than one extra row the user can untick.
 */
const NON_GAME_NAME = /^(proton|steam linux runtime|steamworks common|microsoft visual c\+\+|directx)/i

function isGame(game: FoundGame): boolean {
  if (game.steamAppId != null && NON_GAME_APP_IDS.has(game.steamAppId)) return false
  return !NON_GAME_NAME.test(game.name)
}

/**
 * Every installed game this machine will admit to, from every source, each
 * marked with whether the library already has it.
 *
 * Sources run in parallel and failures are per-source: a launcher that is not
 * installed, or a registry hive that cannot be read, contributes nothing rather
 * than failing the scan.
 */
export async function listInstalledGames(
  extraFolders: string[] = [],
  launcherFolders: Partial<Record<GameSource, string>> = {}
): Promise<InstalledGame[]> {
  // A fresh scan must see anything installed since the last one.
  clearUninstallCache()

  // A launcher folder the user set is scanned IN ADDITION to the automatic
  // detection, not instead of it — someone with games in two places should get
  // both, and nobody should have to configure a launcher that already works.
  const overrides = Object.entries(launcherFolders)
    .filter(([, folder]) => !!folder)
    .map(([source, folder]) => scanFolder(folder as string, source as GameSource))

  // The shortcut read is started alongside the scanners rather than after
  // them: it is an independent PowerShell round trip, and waiting for the
  // scans to finish first simply adds its cost to theirs.
  const shortcuts = launchUrisByName()

  const scans = await Promise.allSettled([
    scanSteam(),
    scanEpic(),
    scanGog(),
    scanXbox(),
    scanBattleNet(),
    scanEa(),
    scanNexon(launcherFolders.nexon ? [launcherFolders.nexon] : []),
    ...overrides,
    ...extraFolders.map((folder) => scanFolder(folder))
  ])

  const found: FoundGame[] = []
  for (const result of scans) {
    if (result.status === 'fulfilled') found.push(...result.value)
  }

  const byName = await shortcuts
  for (const game of found) {
    if (game.launchUri || game.steamAppId != null) continue
    const uri = byName.get(normalizeGameName(game.name))
    if (uri) game.launchUri = uri
  }

  const profiles = Object.values(dataStore.get().profiles)
  const knownAppIds = new Set(profiles.map((p) => p.steamAppId).filter((id): id is number => id != null))
  const knownNames = new Set(profiles.map((p) => normalizeGameName(p.name)))
  const knownExes = new Set(profiles.map((p) => p.exePath?.toLowerCase()).filter(Boolean))

  // One game can legitimately be found twice — a Steam game also present in the
  // uninstall registry, or a folder scan pointed at a launcher's own directory.
  // First source wins, and the order above puts the ones with exact ids first.
  const byIdentity = new Map<string, InstalledGame>()
  for (const game of found) {
    if (!isGame(game)) continue
    const identity =
      game.steamAppId != null ? `appid:${game.steamAppId}` : `name:${normalizeGameName(game.name)}`
    if (byIdentity.has(identity)) continue

    byIdentity.set(identity, {
      ...game,
      // Appid first because it is exact; the name check catches a game added
      // manually before it was ever linked, which has no appid to compare.
      alreadyAdded:
        (game.steamAppId != null && knownAppIds.has(game.steamAppId)) ||
        knownNames.has(normalizeGameName(game.name)) ||
        (game.exePath != null && knownExes.has(game.exePath.toLowerCase()))
    })
  }

  return [...byIdentity.values()].sort(
    (a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name)
  )
}

/**
 * Fills in each game's launcher URI from the Start Menu shortcut that starts it.
 *
 * This is what makes a Nexon game actually playable from Gamut. Vindictus is
 * started with `nxl://launch/10300`, and running its .exe directly skips the
 * launcher's authentication — the game will not start. That id exists in the
 * shortcut and nowhere else on disk (measured), so the shortcut is the only
 * source for it.
 *
 * Matching is by normalised name, and a miss simply leaves launchUri null and
 * falls back to the executable — which is right for Steam (appid), GOG and
 * Blizzard (DRM-free or exe-launchable) and merely unhelpful elsewhere.
 */
async function launchUrisByName(): Promise<Map<string, string>> {
  const byName = new Map<string, string>()
  for (const shortcut of await listShortcuts()) {
    const uri = launchUriFromArgs(shortcut.args)
    if (!uri) continue
    const key = normalizeGameName(shortcut.name)
    if (key && !byName.has(key)) byName.set(key, uri)
  }
  return byName
}

/**
 * Creates a profile for each chosen game, at ZERO playtime.
 *
 * Zero is not a placeholder to be improved later. Gamut exists because Steam's
 * number counts "the process was open" — importing that number would put the
 * very figure this app was built to correct into the field it promises is
 * honest. The prompt says as much, so the zero reads as a starting point.
 *
 * Art and genres come from the normal enrichment path, so an imported game is
 * indistinguishable from one added through the picker. Non-Steam games have no
 * appid, so their art is resolved by name — which is exactly what enrichGame
 * already does for a manually added game.
 */
export async function importInstalledGames(
  ids: string[],
  extraFolders: string[] = [],
  launcherFolders: Partial<Record<GameSource, string>> = {}
): Promise<{ importedCount: number }> {
  const wanted = new Set(ids)
  const games = (await listInstalledGames(extraFolders, launcherFolders)).filter(
    (g) => wanted.has(g.id) && !g.alreadyAdded
  )

  let importedCount = 0
  for (const game of games) {
    try {
      await profileService.createDetected(game.name, game.exePath, game.steamAppId, game.launchUri)
      importedCount++
    } catch {
      // One unimportable game — a name collision with something added while
      // the dialog was open — must never abort the rest of the import.
    }
  }
  return { importedCount }
}
