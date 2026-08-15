import { describe, expect, it } from 'vitest'
import { matchForegroundToRunning, parseForegroundWindowJson } from './foregroundMatch'

describe('parseForegroundWindowJson', () => {
  it('parses a well-formed result', () => {
    const raw = JSON.stringify({
      ExePath: 'C:\\Games\\Doom\\doom.exe',
      ProcessName: 'doom',
      Title: 'DOOM Eternal',
      X: 0,
      Y: 0,
      Width: 1920,
      Height: 1080
    })
    expect(parseForegroundWindowJson(raw)).toEqual({
      exePath: 'C:\\Games\\Doom\\doom.exe',
      processName: 'doom',
      title: 'DOOM Eternal',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 }
    })
  })

  it('returns null for empty output', () => {
    expect(parseForegroundWindowJson('')).toBeNull()
    expect(parseForegroundWindowJson('   ')).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    expect(parseForegroundWindowJson('not json')).toBeNull()
  })

  it('returns null when ProcessName is missing (nothing could be resolved at all)', () => {
    expect(
      parseForegroundWindowJson(JSON.stringify({ ExePath: 'a.exe', Title: 'x', X: 0, Y: 0, Width: 1, Height: 1 }))
    ).toBeNull()
  })

  it('parses ExePath as null when the process is elevated and its path is unreadable, keeping ProcessName', () => {
    // Vindictus under GameGuard, found live: $proc.Path comes back empty for
    // a process running more elevated than this app, but $proc.ProcessName
    // still reads fine — this must still be a usable, resolvable result.
    const raw = JSON.stringify({
      ExePath: null,
      ProcessName: 'Vindictus_x64',
      Title: '',
      X: 0,
      Y: 0,
      Width: 2560,
      Height: 1440
    })
    expect(parseForegroundWindowJson(raw)).toEqual({
      exePath: null,
      processName: 'Vindictus_x64',
      title: '',
      bounds: { x: 0, y: 0, width: 2560, height: 1440 }
    })
  })

  it('returns null when a numeric field is the wrong type', () => {
    expect(
      parseForegroundWindowJson(
        JSON.stringify({ ExePath: 'a.exe', ProcessName: 'a', Title: 'x', X: '0', Y: 0, Width: 1, Height: 1 })
      )
    ).toBeNull()
  })
})

describe('matchForegroundToRunning', () => {
  const candidates = [
    { name: 'Doom Eternal', installDir: 'C:\\Games\\Doom', exePath: null },
    { name: 'Portal 2', installDir: 'C:\\Games\\Portal 2', exePath: null }
  ]

  it('matches the candidate whose install folder contains the focused exe', () => {
    expect(
      matchForegroundToRunning({ exePath: 'C:\\Games\\Doom\\doom.exe', processName: 'doom' }, candidates)
    ).toBe('Doom Eternal')
  })

  it('returns null when the focused exe belongs to no candidate', () => {
    expect(
      matchForegroundToRunning({ exePath: 'C:\\Windows\\explorer.exe', processName: 'explorer' }, candidates)
    ).toBeNull()
  })

  it('is case-insensitive, same as the underlying watcher rule', () => {
    expect(
      matchForegroundToRunning({ exePath: 'c:\\games\\doom\\DOOM.EXE', processName: 'DOOM' }, candidates)
    ).toBe('Doom Eternal')
  })

  it('returns null against an empty candidate list', () => {
    expect(matchForegroundToRunning({ exePath: 'C:\\Games\\Doom\\doom.exe', processName: 'doom' }, [])).toBeNull()
  })

  it('falls back to matching by bare process name when the path is unreadable (elevated), scoped to Nexon/Battle.net/EA', () => {
    const vindictus = {
      name: 'vindictus',
      installDir: null,
      exePath: 'C:\\Nexon\\Library\\vindictus\\appdata\\en-US\\Vindictus_x64.exe',
      launchUri: 'nxl://launch/10300'
    }
    expect(
      matchForegroundToRunning({ exePath: null, processName: 'Vindictus_x64' }, [...candidates, vindictus])
    ).toBe('vindictus')
  })

  it('does NOT use the name-only fallback for a launcher outside the allowlist, even with no path', () => {
    const steamGame = {
      name: 'Some Steam Game',
      installDir: null,
      exePath: 'D:\\SteamLibrary\\common\\game\\game.exe',
      launchUri: null
    }
    expect(matchForegroundToRunning({ exePath: null, processName: 'game' }, [...candidates, steamGame])).toBeNull()
  })
})
