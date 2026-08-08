import { describe, expect, it } from 'vitest'
import { launchUriFromArgs } from './shortcuts'

describe('launchUriFromArgs', () => {
  // Every string here was read off a real .lnk on 2026-08-08.
  it('reads the Nexon launcher URI, which is the only place a Nexon game id exists', () => {
    expect(launchUriFromArgs('nxl://launch/10300')).toBe('nxl://launch/10300')
  })

  it('reads an Epic launcher URI', () => {
    expect(launchUriFromArgs('com.epicgames.launcher://apps/Sugar?action=launch&silent=true')).toBe(
      'com.epicgames.launcher://apps/Sugar?action=launch&silent=true'
    )
  })

  it('reads a Battle.net URI', () => {
    expect(launchUriFromArgs('battlenet://heroes')).toBe('battlenet://heroes')
  })

  it('finds the URI among other arguments', () => {
    expect(launchUriFromArgs('--foo steam://rungameid/413150 --bar')).toBe('steam://rungameid/413150')
  })

  it('strips a trailing quote', () => {
    expect(launchUriFromArgs('"nxl://launch/10300"')).toBe('nxl://launch/10300')
  })

  it('returns null for a shortcut that just runs an exe', () => {
    // Blizzard's and GOG's shortcuts look like this — the exe fallback is correct there.
    expect(launchUriFromArgs('')).toBeNull()
    expect(launchUriFromArgs('/command=runGame /gameId=2106942030')).toBeNull()
  })

  it('ignores a scheme that is not a game launcher', () => {
    // openExternal will hand any scheme to Windows, so the allowlist matters.
    expect(launchUriFromArgs('file:///C:/Windows/System32/cmd.exe')).toBeNull()
    expect(launchUriFromArgs('https://example.com')).toBeNull()
  })
})
