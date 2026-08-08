import { scanSteamLibrary } from './steamLibrary'
import { normalizeGameName } from './matchHit'
import { dataStore } from '../store/dataStore'
import { profileService } from '../store/profileService'
import type { SteamGame } from './steamVdf'
import type { InstalledGame } from '@shared/types'

/**
 * Adding every game already installed on this PC, without making the user
 * find each one in a picker.
 *
 * The scan itself is not new work: scanSteamLibrary() already reads every
 * appmanifest across every Steam library folder and has done since the Add
 * Game picker needed to resolve one exe. All of this module is the *import*
 * around it — deciding what is a game, what is already known, and what a
 * freshly imported profile should look like.
 *
 * Steam only, deliberately. Epic, GOG Galaxy and Xbox each keep their own
 * install registry and none of them has been opened on a real machine yet;
 * the .exe ProductName lesson (right 5 times, empty 3, actively WRONG 4)
 * is why nothing here is written from a format that hasn't been measured.
 */

/**
 * Steam ships tools through the same appmanifest mechanism as games, so they
 * turn up in a library scan looking exactly like one.
 *
 * 228980 was MEASURED on a real machine — "Steamworks Common Redistributables"
 * sat in a 12-entry library. The rest are the well-known runtimes that appear
 * for the same reason; they cost nothing to list and each one that shows up in
 * "Gamut found N games" makes the feature look broken.
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
 * Names that describe a runtime rather than a game. A safety net for tool
 * appids not in the list above — deliberately narrow, because a false positive
 * here silently hides a real game from the import, which is worse than showing
 * one extra row the user can untick.
 */
const NON_GAME_NAME = /^(proton|steam linux runtime|steamworks common)/i

function isGame(game: SteamGame): boolean {
  return !NON_GAME_APP_IDS.has(game.appId) && !NON_GAME_NAME.test(game.name)
}

/**
 * Every installed Steam game, each marked with whether the library already has
 * it. Already-present games are returned rather than filtered out so the list
 * shows the whole picture — "17 found, 12 already added" is informative, a
 * silently shorter list is not.
 */
export async function listInstalledGames(): Promise<InstalledGame[]> {
  // Deliberately uncached: this runs when the user has explicitly asked what is
  // installed, and a game installed two minutes ago must show up.
  const installed = (await scanSteamLibrary(true)).filter(isGame)
  const profiles = Object.values(dataStore.get().profiles)

  const knownAppIds = new Set(profiles.map((p) => p.steamAppId).filter((id): id is number => id != null))
  const knownNames = new Set(profiles.map((p) => normalizeGameName(p.name)))

  return installed
    .map((game) => ({
      appId: game.appId,
      name: game.name,
      // Appid first because it is exact; the name check catches a game added
      // manually before it was ever linked to Steam, which has no appid to
      // compare and would otherwise be imported a second time.
      alreadyAdded: knownAppIds.has(game.appId) || knownNames.has(normalizeGameName(game.name))
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Creates a profile for each chosen appid, at ZERO playtime.
 *
 * Zero is not a placeholder to be improved later. Gamut exists because Steam's
 * number counts "the process was open" — importing that number would put the
 * very figure this app was built to correct into the field it promises is
 * honest. The prompt says as much, so the zero reads as a starting point
 * rather than a bug.
 *
 * Art and genres come from the normal enrichment path, so an imported game is
 * indistinguishable from one added through the picker.
 */
export async function importInstalledGames(appIds: number[]): Promise<{ importedCount: number }> {
  const wanted = new Set(appIds)
  const games = (await listInstalledGames()).filter((g) => wanted.has(g.appId) && !g.alreadyAdded)

  let importedCount = 0
  for (const game of games) {
    try {
      // No exe path: the appid alone is enough to launch through Steam (which
      // is the correct way anyway — it applies the game's launch options) and
      // enough to fetch art.
      await profileService.createDetected(game.name, null, game.appId)
      importedCount++
    } catch {
      // One unimportable game — a name collision with something added while
      // the dialog was open — must never abort the rest of the import.
    }
  }
  return { importedCount }
}
