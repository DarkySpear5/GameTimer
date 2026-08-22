import { describe, expect, it } from 'vitest'
import { isGameRunning, matchingPaths, isElevatedNameMatch } from './watchMatch'

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

describe('isGameRunning — name-only fallback (elevated processes)', () => {
  // Vindictus, found live: GameGuard runs it elevated, so Gamut (unelevated)
  // can never read its process path — it will NEVER appear in the `running`
  // path set, only in `runningNamesNoPath`.
  const vindictus = {
    installDir: null,
    exePath: 'C:\\Nexon\\Library\\vindictus\\appdata\\en-US\\Vindictus_x64.exe',
    launchUri: 'nxl://launch/10300'
  }

  it('matches by bare process name when the path is unavailable', () => {
    expect(isGameRunning(vindictus, running(), new Set(['vindictus_x64']))).toBe(true)
  })

  it('is case-insensitive on the name fallback too — the profile side, since runningNamesNoPath is always pre-lowercased by its caller same as the path set', () => {
    const mixedCaseExe = { ...vindictus, exePath: 'C:\\Nexon\\Library\\vindictus\\appdata\\en-US\\VinDICTus_X64.EXE' }
    expect(isGameRunning(mixedCaseExe, running(), new Set(['vindictus_x64']))).toBe(true)
  })

  it('does not match a different name', () => {
    expect(isGameRunning(vindictus, running(), new Set(['some_other_game']))).toBe(false)
  })

  it('is a no-op when no name set is passed at all', () => {
    expect(isGameRunning(vindictus, running())).toBe(false)
  })

  // Rocket League, found live 2026-08-22: its launcher stub (Launcher.exe,
  // unelevated, readable path) matches normally via the folder check, but
  // hands off to the real binary under EasyAntiCheat, which Windows reports
  // with an EMPTY path — confirmed via a real Get-Process on the user's
  // machine, both RocketLeague.exe and EasyAntiCheat_EOS came back with
  // Path: "". The profile's own launchUri is null (Epic games don't get one
  // from installedSources.ts's Epic scanner) — this used to fall through the
  // launcher-scope check and never match. Its exePath is ALSO the wrong
  // reference for a bare-name comparison: it's the launcher stub
  // ("Launcher.exe"), never the real running binary ("RocketLeague.exe") —
  // the two have nothing in common as strings. What the real process name DOES
  // share is the game's own title, so the fallback also tries a normalized
  // profile-name comparison, same heuristic findGameExe already uses to pick
  // an exe out of a folder.
  const rocketLeague = {
    installDir: 'C:\\Program Files\\Epic Games\\rocketleague',
    exePath: 'C:\\Program Files\\Epic Games\\rocketleague\\Binaries\\Win64\\Launcher.exe',
    launchUri: null,
    name: 'Rocket League®'
  }

  it('applies to a game with no launchUri at all, matching by normalized game NAME since exePath is the launcher stub, not the real binary', () => {
    expect(isGameRunning(rocketLeague, running(), new Set(['rocketleague']))).toBe(true)
  })

  it('applies regardless of which launcher scheme the game has (Steam)', () => {
    const steamGame = {
      installDir: null,
      exePath: 'D:\\SteamLibrary\\common\\game\\game.exe',
      launchUri: 'steam://rungameid/123'
    }
    expect(isGameRunning(steamGame, running(), new Set(['game']))).toBe(true)
  })

  it('never applies to a game with no exePath (nothing to compare the name against)', () => {
    const noExe = { installDir: 'C:\\Games\\Something', exePath: null, launchUri: null }
    expect(isGameRunning(noExe, running(), new Set(['something']))).toBe(false)
  })

  it('still matches normally by path when the path IS available', () => {
    expect(isGameRunning(vindictus, running(vindictus.exePath))).toBe(true)
  })

  it('a profile name alone (no exePath at all) is enough to match, same as Steam profiles having no exePath for the folder check', () => {
    const noExeButNamed = { installDir: null, exePath: null, launchUri: null, name: 'Rocket League®' }
    expect(isGameRunning(noExeButNamed, running(), new Set(['rocketleague']))).toBe(true)
  })

  it('does not match a same-shaped but different game name', () => {
    expect(isGameRunning(rocketLeague, running(), new Set(['some_other_game']))).toBe(false)
  })
})

describe('isElevatedNameMatch', () => {
  // The exhaustive scoping rules (exePath required, case sensitivity) are
  // already covered via isGameRunning above — this just confirms the exported
  // direct entry point gameWatcher.ts actually calls behaves the same way,
  // since it's now a public part of the contract.
  const vindictus = {
    installDir: null,
    exePath: 'C:\\Nexon\\Library\\vindictus\\appdata\\en-US\\Vindictus_x64.exe',
    launchUri: 'nxl://launch/10300'
  }

  it('is true for a name-only match', () => {
    expect(isElevatedNameMatch(vindictus, new Set(['vindictus_x64']))).toBe(true)
  })

  it('is false when nothing matches', () => {
    expect(isElevatedNameMatch(vindictus, new Set(['something_else']))).toBe(false)
  })
})

describe('isGameRunning — Xbox/GDK package-virtualized path', () => {
  // Indika, verified live 2026-08-22: installed (and scanned by Gamut) at
  // C:\XboxGames\INDIKA\Content\..., but the RUNNING process's own .Path is
  // reported by Windows as C:\Program Files\WindowsApps\<PackageFamilyName>\...
  // — a totally different string, because GDK/Store-packaged games present a
  // virtualized package-identity view of their files to Get-Process. Neither
  // folder-prefix nor exact-exe matching can ever succeed here; the one thing
  // shared between the two paths is everything after "\Content\", which is
  // identical in both because that's the package's virtual root either way.
  const indika = {
    installDir: 'C:\\XboxGames\\INDIKA',
    exePath: 'C:\\XboxGames\\INDIKA\\Content\\Indika\\Binaries\\WinGDK\\Indika-WinGDK-Shipping.exe'
  }
  const liveVirtualizedPath =
    'C:\\Program Files\\WindowsApps\\4063811bitstudios.INDIKA_1.0.0.0_x64__gwy9gn5q9j1y6\\Indika\\Binaries\\WinGDK\\Indika-WinGDK-Shipping.exe'

  it('matches the live virtualized path via the shared Content-relative suffix', () => {
    expect(isGameRunning(indika, running(liveVirtualizedPath))).toBe(true)
  })

  it('does not match an unrelated process under WindowsApps', () => {
    expect(
      isGameRunning(indika, running('C:\\Program Files\\WindowsApps\\some.other.app_1.0.0.0\\App.exe'))
    ).toBe(false)
  })

  it('does not apply when the profile exe is not under installDir\\Content\\ at all', () => {
    const notXboxShaped = { installDir: 'C:\\Games\\Foo', exePath: 'C:\\Games\\Foo\\Foo.exe' }
    expect(
      isGameRunning(notXboxShaped, running('C:\\Program Files\\WindowsApps\\whatever\\Foo.exe'))
    ).toBe(false)
  })

  it('still matches normally by real folder path too (not installed via Xbox virtualization this run)', () => {
    expect(
      isGameRunning(indika, running('C:\\XboxGames\\INDIKA\\Content\\Indika\\Binaries\\WinGDK\\Indika-WinGDK-Shipping.exe'))
    ).toBe(true)
  })
})

describe('matchingPaths', () => {
  it('returns the live virtualized path too, so Stop can find its PID', () => {
    const indika = {
      installDir: 'C:\\XboxGames\\INDIKA',
      exePath: 'C:\\XboxGames\\INDIKA\\Content\\Indika\\Binaries\\WinGDK\\Indika-WinGDK-Shipping.exe'
    }
    const liveVirtualizedPath =
      'c:\\program files\\windowsapps\\4063811bitstudios.indika_1.0.0.0_x64__gwy9gn5q9j1y6\\indika\\binaries\\wingdk\\indika-wingdk-shipping.exe'
    expect(matchingPaths(indika, running(liveVirtualizedPath))).toEqual([liveVirtualizedPath])
  })

  // Stop needs every matching path (to find their PIDs), not just a yes/no —
  // Rocket League's launcher-plus-binary shape means that can be more than one.
  it('returns every process under the install folder, not just the first', () => {
    const rocketLeague = {
      installDir: 'C:\\Program Files\\Epic Games\\rocketleague',
      exePath: 'C:\\Program Files\\Epic Games\\rocketleague\\Binaries\\Win64\\Launcher.exe'
    }
    expect(
      matchingPaths(
        rocketLeague,
        running(
          'C:\\Program Files\\Epic Games\\rocketleague\\Binaries\\Win64\\Launcher.exe',
          'C:\\Program Files\\Epic Games\\rocketleague\\Binaries\\Win64\\RocketLeague.exe',
          'C:\\Windows\\explorer.exe'
        )
      )
    ).toEqual([
      'c:\\program files\\epic games\\rocketleague\\binaries\\win64\\launcher.exe',
      'c:\\program files\\epic games\\rocketleague\\binaries\\win64\\rocketleague.exe'
    ])
  })

  it('returns an empty list when nothing matches', () => {
    const game = { installDir: 'C:\\Games\\Portal', exePath: null }
    expect(matchingPaths(game, running('C:\\Windows\\explorer.exe'))).toEqual([])
  })
})
