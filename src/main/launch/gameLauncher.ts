import { shell } from 'electron'
import { spawn } from 'child_process'
import { dirname } from 'path'
import { existsSync } from 'fs'
import { dataStore } from '../store/dataStore'
import { gameWatcher } from '../detect/gameWatcher'
import { listRunningProcesses } from '../detect/processes'
import { matchingPaths } from '../detect/watchMatch'

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

/**
 * Kills every running process that belongs to this game (same folder/exe
 * match the watcher uses) and tells gameWatcher it's closed so the Launch
 * button flips back immediately instead of waiting for the next poll.
 *
 * A launcher-fronted game is rarely one process — Rocket League's own launcher
 * hands off to a second binary — so this kills every match under the install
 * folder, not just the one the profile happens to remember.
 *
 * Path-only, deliberately: a Nexon/Battle.net/EA anti-cheat game (Vindictus,
 * found live) runs ELEVATED, and a plain `taskkill` from this unelevated app
 * gets Access Denied against it regardless of whether its PID is known — so
 * there's nothing useful to attempt here for that case. The renderer instead
 * disables the Stop button outright for a game gameWatcher is reporting as
 * elevated-detected (see gameWatcher.unstoppableNames), rather than offering
 * a button that would silently fail — see gameWatcher.ts and LibraryDetail.tsx.
 */
export async function stopGame(name: string): Promise<{ stopped: boolean }> {
  const profile = dataStore.get().profiles[name]
  if (!profile) return { stopped: false }

  const processes = await listRunningProcesses()
  const knownPaths = processes.filter((p): p is { path: string; name: string; pid: number } => p.path !== null)
  const paths = matchingPaths(
    { installDir: profile.installDir ?? null, exePath: profile.exePath ?? null },
    knownPaths.map((p) => p.path)
  )
  const pids = knownPaths.filter((p) => paths.includes(p.path)).map((p) => p.pid)
  if (pids.length === 0) {
    gameWatcher.noteClosed(name)
    return { stopped: false }
  }

  for (const pid of pids) {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).unref()
  }
  gameWatcher.noteClosed(name)
  return { stopped: true }
}

/**
 * Opens Explorer at the game's install location.
 *
 * showItemInFolder (select the .exe) is preferred over openPath (just open the
 * folder) when an exe is known — landing on the actual file is more useful
 * than the top of a folder that might hold dozens of unrelated ones, and it's
 * how "show in folder" behaves everywhere else in Windows. Falls back to
 * installDir for a Steam/Store game, which has no exe on disk that Gamut
 * knows about at all.
 */
export async function openExeDirectory(name: string): Promise<{ opened: boolean }> {
  const profile = dataStore.get().profiles[name]
  if (!profile) return { opened: false }

  if (profile.exePath && existsSync(profile.exePath)) {
    shell.showItemInFolder(profile.exePath)
    return { opened: true }
  }
  if (profile.installDir && existsSync(profile.installDir)) {
    const error = await shell.openPath(profile.installDir)
    return { opened: error === '' }
  }
  return { opened: false }
}
