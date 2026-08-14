import { describe, expect, it } from 'vitest'
import { matchForegroundToRunning, parseForegroundWindowJson } from './foregroundMatch'

describe('parseForegroundWindowJson', () => {
  it('parses a well-formed result', () => {
    const raw = JSON.stringify({
      ExePath: 'C:\\Games\\Doom\\doom.exe',
      Title: 'DOOM Eternal',
      X: 0,
      Y: 0,
      Width: 1920,
      Height: 1080
    })
    expect(parseForegroundWindowJson(raw)).toEqual({
      exePath: 'C:\\Games\\Doom\\doom.exe',
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

  it('returns null when ExePath is missing (no process could be resolved)', () => {
    expect(
      parseForegroundWindowJson(JSON.stringify({ Title: 'x', X: 0, Y: 0, Width: 1, Height: 1 }))
    ).toBeNull()
  })

  it('returns null when a numeric field is the wrong type', () => {
    expect(
      parseForegroundWindowJson(
        JSON.stringify({ ExePath: 'a.exe', Title: 'x', X: '0', Y: 0, Width: 1, Height: 1 })
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
    expect(matchForegroundToRunning('C:\\Games\\Doom\\doom.exe', candidates)).toBe('Doom Eternal')
  })

  it('returns null when the focused exe belongs to no candidate', () => {
    expect(matchForegroundToRunning('C:\\Windows\\explorer.exe', candidates)).toBeNull()
  })

  it('is case-insensitive, same as the underlying watcher rule', () => {
    expect(matchForegroundToRunning('c:\\games\\doom\\DOOM.EXE', candidates)).toBe('Doom Eternal')
  })

  it('returns null against an empty candidate list', () => {
    expect(matchForegroundToRunning('C:\\Games\\Doom\\doom.exe', [])).toBeNull()
  })
})
