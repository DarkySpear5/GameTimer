import { shell } from 'electron'
import { spawn } from 'child_process'
import { dirname } from 'path'
import { dataStore } from '../store/dataStore'
import { gameWatcher } from '../detect/gameWatcher'

/**
 * Only these schemes are ever handed to the shell.
 *
 * launchUri comes from a .lnk on disk, so it is not attacker-controlled in any
 * ordinary sense — but openExternal will hand ANY scheme to Windows, and an
 * allowlist is the difference between "start a game" and "run whatever this
 * string says". The save file is security-relevant (see the roadmap's §12.3),
 * so this is checked at the point of use.
 */
const LAUNCHER_SCHEMES = /^(nxl|steam|battlenet|goggalaxy|com\.epicgames\.launcher|origin2|link2ea):\/\//i

function isKnownLauncherUri(uri: string): boolean {
  return LAUNCHER_SCHEMES.test(uri)
}

/**
 * `shell:appsFolder\<PackageFamilyName>!<AppId>` — the only way to start a
 * Store app. Matched strictly, because this string is handed to explorer.exe
 * and `shell:` can address a great many things that are not games.
 */
const STORE_APP_LAUNCH = /^shell:appsFolder\\[A-Za-z0-9._-]+_[a-z0-9]+![A-Za-z0-9._-]+$/

function isStoreAppLaunch(uri: string): boolean {
  return STORE_APP_LAUNCH.test(uri)
}

/**
 * Starts a game and records the launch.
 *
 * Steam games go through `steam://rungameid/<appid>` rather than their stored
 * executable, and that is not a shortcut — it is more correct. Steam applies
 * the game's configured launch options, which is what makes Stardew Valley
 * start through SMAPI and Marvel Rivals through its launcher. Spawning the raw
 * .exe bypasses all of that and breaks modded or launcher-fronted games.
 *
 * The same reasoning extends to every other launcher, which is what launchUri
 * is for: `nxl://launch/10300` starts Vindictus THROUGH the Nexon launcher,
 * and that matters more than convenience — a Nexon game started straight from
 * its .exe never gets through the launcher's authentication. Battle.net and
 * Epic behave the same way.
 *
 * Order: Steam appid, then the launcher's own URI, then the raw .exe. The .exe
 * is the fallback for games belonging to no launcher, spawned detached so
 * closing Gamut never takes the game down with it.
 */
export async function launchGame(name: string): Promise<{ launched: boolean }> {
  const profile = dataStore.get().profiles[name]
  if (!profile) return { launched: false }

  try {
    if (profile.steamAppId != null) {
      await shell.openExternal(`steam://rungameid/${profile.steamAppId}`)
    } else if (profile.launchUri && isStoreAppLaunch(profile.launchUri)) {
      // A Store/Xbox game is not a URL and not a runnable path — it is an app
      // container started by its AUMID. Explorer is what Windows itself uses to
      // do that, and there is no shell.openExternal equivalent. Measured
      // against Super Lucky's Tale, whose SuperLucky.exe cannot be run directly.
      spawn('explorer.exe', [profile.launchUri], { detached: true, stdio: 'ignore' }).unref()
    } else if (profile.launchUri && isKnownLauncherUri(profile.launchUri)) {
      await shell.openExternal(profile.launchUri)
    } else if (profile.exePath) {
      spawn(profile.exePath, [], {
        detached: true,
        stdio: 'ignore',
        // Plenty of games resolve assets relative to their own directory and
        // fail outright when started from somewhere else.
        cwd: dirname(profile.exePath)
      }).unref()
    } else {
      return { launched: false }
    }
  } catch {
    return { launched: false }
  }

  profile.launches += 1
  gameWatcher.noteLaunched(name)
  await dataStore.safeSave()
  return { launched: true }
}
