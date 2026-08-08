import { describe, expect, it } from 'vitest'
import { matchExeToGame, parseAppManifest, parseLibraryFolders, type SteamGame } from './steamVdf'

// Real shapes, trimmed. Both formats are Valve KeyValues, not JSON.
const MANIFEST = `"AppState"
{
	"appid"		"2142790"
	"universe"		"1"
	"name"		"Fields of Mistria"
	"StateFlags"		"4"
	"installdir"		"Fields of Mistria"
	"LastUpdated"		"1754500000"
}`

const LIBRARY_FOLDERS = `"libraryfolders"
{
	"0"
	{
		"path"		"C:\\\\Program Files (x86)\\\\Steam"
		"label"		""
	}
	"1"
	{
		"path"		"D:\\\\SteamLibrary"
		"label"		""
	}
}`

describe('parseAppManifest', () => {
  it('pulls appid, name and installdir', () => {
    expect(parseAppManifest(MANIFEST)).toEqual({
      appId: 2142790,
      name: 'Fields of Mistria',
      installDir: 'Fields of Mistria'
    })
  })

  it('returns null when a required field is missing', () => {
    expect(parseAppManifest('"AppState" { "appid" "123" }')).toBeNull()
  })

  it('returns null on junk rather than throwing', () => {
    expect(parseAppManifest('not a manifest at all')).toBeNull()
  })
})

describe('parseLibraryFolders', () => {
  it('finds every library root and unescapes the backslashes', () => {
    expect(parseLibraryFolders(LIBRARY_FOLDERS)).toEqual([
      'C:\\Program Files (x86)\\Steam',
      'D:\\SteamLibrary'
    ])
  })

  it('returns empty for junk', () => {
    expect(parseLibraryFolders('')).toEqual([])
  })
})

describe('matchExeToGame', () => {
  const games: SteamGame[] = [
    { appId: 413150, name: 'Stardew Valley', installDir: 'Stardew Valley' },
    { appId: 427410, name: 'Abiotic Factor', installDir: 'AbioticFactor' }
  ]

  it('matches on the install folder, whatever the exe is called', () => {
    // The largest exe here reports ProductName "SMAPI" — the folder does not lie.
    const exe = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Stardew Valley\\StardewModdingAPI.exe'
    expect(matchExeToGame(exe, games)?.appId).toBe(413150)
  })

  it('matches an exe nested deeper in the install', () => {
    const exe = 'D:\\SteamLibrary\\steamapps\\common\\AbioticFactor\\Binaries\\Win64\\AbioticFactor.exe'
    expect(matchExeToGame(exe, games)?.appId).toBe(427410)
  })

  it('is case-insensitive and tolerates forward slashes', () => {
    const exe = 'd:/steamlibrary/STEAMAPPS/Common/stardew valley/x.exe'
    expect(matchExeToGame(exe, games)?.appId).toBe(413150)
  })

  it('returns null for a non-Steam path', () => {
    expect(matchExeToGame('C:\\Program Files\\Epic Games\\Thing\\t.exe', games)).toBeNull()
  })

  it('returns null when the folder is not an installed game', () => {
    const exe = 'C:\\Steam\\steamapps\\common\\Something Else\\x.exe'
    expect(matchExeToGame(exe, games)).toBeNull()
  })
})
