import { describe, expect, it } from 'vitest'
import { filterAndRank, isLikelyGame, type RawProcess } from './processFilter'

const p = (over: Partial<RawProcess>): RawProcess => ({
  Id: 1,
  ProcessName: 'game',
  MainWindowTitle: 'Game',
  Path: 'C:\\Games\\game.exe',
  ...over
})

describe('isLikelyGame', () => {
  it('recognises a Steam install', () => {
    expect(isLikelyGame('C:\\Program Files (x86)\\Steam\\steamapps\\common\\Stardew Valley\\x.exe')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isLikelyGame('D:\\STEAMAPPS\\COMMON\\Doom\\doom.exe')).toBe(true)
  })

  it('recognises Epic and GOG', () => {
    expect(isLikelyGame('C:\\Program Files\\Epic Games\\Fortnite\\x.exe')).toBe(true)
    expect(isLikelyGame('C:\\GOG Galaxy\\Games\\Witcher\\x.exe')).toBe(true)
  })

  it('does not claim an arbitrary path', () => {
    expect(isLikelyGame('C:\\Users\\me\\Downloads\\thing.exe')).toBe(false)
  })
})

describe('filterAndRank', () => {
  it('drops processes with no resolvable path', () => {
    expect(filterAndRank([p({ Path: null })])).toEqual([])
  })

  it('drops windowless background processes', () => {
    expect(filterAndRank([p({ MainWindowTitle: '' })])).toEqual([])
  })

  it('drops launchers, browsers and the app itself', () => {
    const raw = ['chrome', 'steam', 'steamwebhelper', 'Discord', 'explorer', 'Gamut', 'TextInputHost'].map(
      (n) => p({ ProcessName: n, Path: `C:\\x\\${n}.exe` })
    )
    expect(filterAndRank(raw)).toEqual([])
  })

  it('keeps one tile per executable when a game spawns helper windows', () => {
    const raw = [
      p({ Id: 1, Path: 'C:\\Games\\g.exe', MainWindowTitle: 'Game' }),
      p({ Id: 2, Path: 'C:\\games\\G.EXE', MainWindowTitle: 'Game helper' })
    ]
    expect(filterAndRank(raw)).toHaveLength(1)
  })

  it('excludes Gamut itself by path, not by process name', () => {
    // In a dev run Gamut's process is called "electron", so the name denylist
    // does not catch it — it listed itself in the picker until this existed.
    const self = 'C:\\repo\\node_modules\\electron\\dist\\electron.exe'
    const raw = [p({ ProcessName: 'electron', MainWindowTitle: 'Gamut', Path: self })]
    expect(filterAndRank(raw, self)).toEqual([])
    expect(filterAndRank(raw, 'C:\\other.exe')).toHaveLength(1)
  })

  it('sorts likely games above everything else', () => {
    const raw = [
      p({ ProcessName: 'zzz', MainWindowTitle: 'Aaa tool', Path: 'C:\\Tools\\a.exe' }),
      p({ Id: 2, ProcessName: 'doom', MainWindowTitle: 'Zzz Game', Path: 'D:\\steamapps\\common\\Doom\\d.exe' })
    ]
    expect(filterAndRank(raw).map((r) => r.title)).toEqual(['Zzz Game', 'Aaa tool'])
  })

  it('sorts alphabetically within a group', () => {
    const raw = [
      p({ Id: 1, MainWindowTitle: 'B tool', Path: 'C:\\t\\b.exe' }),
      p({ Id: 2, MainWindowTitle: 'A tool', Path: 'C:\\t\\a.exe' })
    ]
    expect(filterAndRank(raw).map((r) => r.title)).toEqual(['A tool', 'B tool'])
  })
})
