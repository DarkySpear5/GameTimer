import { shell } from 'electron'
import { spawn } from 'child_process'
import { dirname } from 'path'
import { dataStore } from '../store/dataStore'
import { gameWatcher } from '../detect/gameWatcher'

/**
 * Starts a game and records the launch.
 *
 * Steam games go through `steam://rungameid/<appid>` rather than their stored
 * executable, and that is not a shortcut — it is more correct. Steam applies
 * the game's configured launch options, which is what makes Stardew Valley
 * start through SMAPI and Marvel Rivals through its launcher. Spawning the raw
 * .exe bypasses all of that and breaks modded or launcher-fronted games.
 *
 * The .exe is the fallback for games with no appid, spawned detached so
 * closing Gamut never takes the game down with it.
 */
export async function launchGame(name: string): Promise<{ launched: boolean }> {
  const profile = dataStore.get().profiles[name]
  if (!profile) return { launched: false }

  try {
    if (profile.steamAppId != null) {
      await shell.openExternal(`steam://rungameid/${profile.steamAppId}`)
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
