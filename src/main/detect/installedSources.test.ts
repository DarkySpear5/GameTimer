import { describe, expect, it } from 'vitest'
import { battleNetLaunchUri } from './installedSources'

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
