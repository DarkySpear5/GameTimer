import { describe, expect, it } from 'vitest'
import { candidateNames, folderNameFor } from './candidateName'

describe('folderNameFor', () => {
  it('takes the install folder, not the exe name', () => {
    // The exe here is StardewModdingAPI.exe and its ProductName is "SMAPI".
    expect(
      folderNameFor('C:\\Steam\\steamapps\\common\\Stardew Valley\\StardewModdingAPI.exe')
    ).toBe('Stardew Valley')
  })

  it('walks past generic build directories', () => {
    expect(
      folderNameFor('D:\\SteamLibrary\\steamapps\\common\\AbioticFactor\\Binaries\\Win64\\AbioticFactor.exe')
    ).toBe('Abiotic Factor')
  })

  it('splits PascalCase into searchable words', () => {
    expect(folderNameFor('C:\\Games\\MarvelRivals\\game.exe')).toBe('Marvel Rivals')
  })

  it('handles forward slashes', () => {
    expect(folderNameFor('D:/Games/Hollow Knight/hk.exe')).toBe('Hollow Knight')
  })

  it('does not walk up into the drive root', () => {
    expect(folderNameFor('C:\\bin\\x.exe')).toBe('')
  })
})

describe('candidateNames', () => {
  it('puts the folder name first', () => {
    const c = candidateNames('C:\\Games\\Hollow Knight\\hk.exe', 'Hollow Knight')
    expect(c[0]).toBe('Hollow Knight')
  })

  it('strips decoration from a window title', () => {
    const c = candidateNames('C:\\x\\y.exe', 'DOOM Eternal - 143 FPS')
    expect(c).toContain('DOOM Eternal')
  })

  it('deduplicates when folder and title agree', () => {
    const c = candidateNames('C:\\Games\\Palworld\\Palworld.exe', 'Palworld')
    expect(c.filter((n) => n.toLowerCase() === 'palworld')).toHaveLength(1)
  })

  it('drops architecture and launcher noise', () => {
    const c = candidateNames('C:\\Games\\DoomEternal\\DOOMEternalx64vk.exe', '')
    expect(c[0]).toBe('Doom Eternal')
  })

  it('never returns empty strings', () => {
    expect(candidateNames('C:\\bin\\a.exe', '').every((n) => n.length > 1)).toBe(true)
  })
})
