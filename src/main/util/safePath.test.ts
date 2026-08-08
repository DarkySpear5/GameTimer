import { describe, expect, it } from 'vitest'
import { isInside, safeAssetFileName } from './safePath'

describe('safeAssetFileName', () => {
  it('leaves the UUID names v1 actually wrote untouched', () => {
    expect(safeAssetFileName('3f2a9c8e-1b4d-4a7f-9c2e-8d1a5b6c7e9f.png')).toBe(
      '3f2a9c8e-1b4d-4a7f-9c2e-8d1a5b6c7e9f.png'
    )
  })

  it('strips directory components instead of following them', () => {
    expect(safeAssetFileName('../../../evil.png')).toBe('evil.png')
    expect(safeAssetFileName('..\\..\\evil.png')).toBe('evil.png')
    expect(safeAssetFileName('C:\\Windows\\System32\\evil.png')).toBe('evil.png')
    expect(safeAssetFileName('/etc/passwd.png')).toBe('passwd.png')
  })

  it('forces a safe image extension', () => {
    expect(safeAssetFileName('payload.bat')).toBe('payload.png')
    expect(safeAssetFileName('../../Startup/run.cmd')).toBe('run.png')
  })

  it('rejects names with nothing usable left', () => {
    expect(safeAssetFileName('..')).toBeNull()
    expect(safeAssetFileName('.')).toBeNull()
    expect(safeAssetFileName('')).toBeNull()
    expect(safeAssetFileName('///')).toBeNull()
    expect(safeAssetFileName(undefined)).toBeNull()
    expect(safeAssetFileName(null)).toBeNull()
  })
})

describe('isInside', () => {
  it('accepts a real child', () => {
    expect(isInside('C:\\data\\icons', 'C:\\data\\icons\\a.png')).toBe(true)
  })

  it('rejects an escape', () => {
    expect(isInside('C:\\data\\icons', 'C:\\data\\icons\\..\\..\\evil.exe')).toBe(false)
    expect(isInside('C:\\data\\icons', 'C:\\Windows\\evil.exe')).toBe(false)
  })

  it('is not fooled by a sibling with a shared prefix', () => {
    expect(isInside('C:\\data\\icons', 'C:\\data\\icons-evil\\a.png')).toBe(false)
  })
})
