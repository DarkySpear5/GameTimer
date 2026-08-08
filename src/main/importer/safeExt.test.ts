import { describe, expect, it } from 'vitest'
import { safeImageExt } from './safeExt'

describe('safeImageExt', () => {
  it('keeps ordinary image extensions', () => {
    for (const ext of ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif']) {
      expect(safeImageExt(ext)).toBe(ext)
    }
  })

  it('normalises case', () => {
    expect(safeImageExt('.PNG')).toBe('.png')
  })

  it('refuses path traversal, which is the whole point', () => {
    expect(safeImageExt('/../../../Start Menu/Programs/Startup/evil.bat')).toBe('.png')
    expect(safeImageExt('..\\..\\evil.exe')).toBe('.png')
    expect(safeImageExt('.png/../../evil')).toBe('.png')
    expect(safeImageExt('C:\\evil.exe')).toBe('.png')
  })

  it('refuses executable and script extensions', () => {
    for (const ext of ['.exe', '.bat', '.cmd', '.ps1', '.dll', '.lnk']) {
      expect(safeImageExt(ext)).toBe('.png')
    }
  })

  it('handles missing or non-string values', () => {
    expect(safeImageExt(undefined)).toBe('.png')
    expect(safeImageExt(null)).toBe('.png')
    expect(safeImageExt(42)).toBe('.png')
    expect(safeImageExt('')).toBe('.png')
  })
})
