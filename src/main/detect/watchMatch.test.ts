import { describe, expect, it } from 'vitest'
import { isGameRunning } from './watchMatch'

const running = (...paths: string[]): Set<string> => new Set(paths.map((p) => p.toLowerCase()))

describe('isGameRunning', () => {
  // The Rocket League case, which is what forced this change. Its stored exe is
  // the LAUNCHER; anti-cheat then starts the real binary and the launcher exits.
  const rocketLeague = {
    installDir: 'C:\\Program Files\\Epic Games\\rocketleague',
    exePath: 'C:\\Program Files\\Epic Games\\rocketleague\\Binaries\\Win64\\Launcher.exe'
  }

  it('sees the launcher while it is the only process', () => {
    expect(isGameRunning(rocketLeague, running(rocketLeague.exePath))).toBe(true)
  })

  it('STILL sees the game once the launcher exits and hands off', () => {
    // Previously this returned false, the timer paused, and nothing resumed it.
    expect(
      isGameRunning(
        rocketLeague,
        running('C:\\Program Files\\Epic Games\\rocketleague\\Binaries\\Win64\\RocketLeague.exe')
      )
    ).toBe(true)
  })

  it('is false once nothing under the folder is running', () => {
    expect(isGameRunning(rocketLeague, running('C:\\Windows\\explorer.exe'))).toBe(false)
  })

  it('watches a Steam game, which has no exePath at all', () => {
    // Steam games launch through steam://rungameid, so exePath is null and the
    // old exact-match watcher skipped them entirely.
    const stardew = {
      installDir: 'D:\\SteamLibrary\\steamapps\\common\\Stardew Valley',
      exePath: null
    }
    expect(
      isGameRunning(stardew, running('D:\\SteamLibrary\\steamapps\\common\\Stardew Valley\\StardewModdingAPI.exe'))
    ).toBe(true)
  })

  it('does not confuse a folder with a sibling that shares its prefix', () => {
    const game = { installDir: 'C:\\Games\\Portal', exePath: null }
    expect(isGameRunning(game, running('C:\\Games\\Portal 2\\portal2.exe'))).toBe(false)
  })

  it('tolerates a trailing separator on the stored folder', () => {
    const game = { installDir: 'C:\\Games\\Celeste\\', exePath: null }
    expect(isGameRunning(game, running('C:\\Games\\Celeste\\Celeste.exe'))).toBe(true)
  })

  it('falls back to the exact executable when no folder is known', () => {
    // A manually linked game: the user pointed at one .exe and nothing else.
    const manual = { installDir: null, exePath: 'C:\\Odd\\Place\\game.exe' }
    expect(isGameRunning(manual, running('C:\\Odd\\Place\\game.exe'))).toBe(true)
    expect(isGameRunning(manual, running('C:\\Odd\\Place\\other.exe'))).toBe(false)
  })

  it('is false when the game has neither', () => {
    expect(isGameRunning({ installDir: null, exePath: null }, running('C:\\a\\b.exe'))).toBe(false)
  })

  it('ignores case, because Windows does', () => {
    expect(
      isGameRunning({ installDir: 'C:\\Games\\Doom', exePath: null }, running('c:\\games\\doom\\doom.exe'))
    ).toBe(true)
  })
})
