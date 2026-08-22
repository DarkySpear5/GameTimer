import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, afterEach } from 'vitest'
import { battleNetLaunchUri, scanXboxRoot } from './installedSources'

describe('scanXboxRoot', () => {
  // Real layout copied from the user's own live install (verified 2026-08-22):
  // C:\XboxGames\INDIKA\Content\gamelaunchhelper.exe is a GDK activation stub,
  // never the game — the real binary sits 3 levels deeper, under Binaries\WinGDK.
  // The old top-level-only readdir picked the stub because it was the only .exe
  // sitting directly in Content, which meant Gamut watched for the WRONG exe
  // (moot for folder-matching, but still wrong data) and made the exe unusable
  // for anything that needs the real one specifically.
  let root: string

  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true })
  })

  it('finds the real shipping exe nested under Content, not the launch-helper stub', async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'gamut-xbox-test-'))
    const contentDir = join(root, 'INDIKA', 'Content')
    const shippingDir = join(contentDir, 'Indika', 'Binaries', 'WinGDK')
    await fs.mkdir(shippingDir, { recursive: true })
    await fs.writeFile(join(contentDir, 'gamelaunchhelper.exe'), '')
    await fs.writeFile(join(shippingDir, 'Indika-WinGDK-Shipping.exe'), '')

    const games = await scanXboxRoot(root)

    expect(games).toHaveLength(1)
    expect(games[0].name).toBe('INDIKA')
    expect(games[0].installDir).toBe(join(root, 'INDIKA'))
    expect(games[0].exePath).toBe(join(shippingDir, 'Indika-WinGDK-Shipping.exe'))
  })

  it('still offers the game by folder name when Content holds no usable exe at all', async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'gamut-xbox-test-'))
    await fs.mkdir(join(root, 'SomeGame', 'Content'), { recursive: true })

    const games = await scanXboxRoot(root)

    expect(games).toHaveLength(1)
    expect(games[0].exePath).toBeNull()
  })

  it('skips the GameSave folder, which is not a game', async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'gamut-xbox-test-'))
    await fs.mkdir(join(root, 'GameSave'), { recursive: true })

    const games = await scanXboxRoot(root)

    expect(games).toEqual([])
  })
})

describe('battleNetLaunchUri', () => {
  it('extracts the product code from a real Battle.net uninstall string', () => {
    // Verified live against the real registry entry for Heroes of the Storm.
    const values = {
      UninstallString:
        '"C:\\ProgramData\\Battle.net\\Agent\\Blizzard Uninstaller.exe" --lang=enUS --uid=heroes --displayname="Heroes of the Storm"'
    }
    expect(battleNetLaunchUri(values)).toBe('battlenet://heroes')
  })

  it('returns null when there is no --uid argument at all', () => {
    expect(battleNetLaunchUri({ UninstallString: '"C:\\Battle.net.exe" --lang=enUS' })).toBeNull()
  })

  it('returns null when UninstallString is missing entirely', () => {
    expect(battleNetLaunchUri({})).toBeNull()
  })

  it('is case-insensitive on the --uid flag itself', () => {
    expect(battleNetLaunchUri({ UninstallString: '--UID=Pro --lang=enUS' })).toBe('battlenet://Pro')
  })
})
