import { describe, expect, it } from 'vitest'
import { isPortraitRatio } from './enrich'

describe('isPortraitRatio', () => {
  it('accepts Steam\'s own library_600x900 (2:3)', () => {
    expect(isPortraitRatio(600, 900)).toBe(true)
  })

  it('rejects Steam\'s header.jpg fallback (460x215) — the real bug that motivated this', () => {
    // Escape Rosecliff Island, appid 3600: no library_600x900 exists for this
    // 2007 game, so fetchArt falls back to header.jpg, which looks bad forced
    // into the Library grid's portrait tiles.
    expect(isPortraitRatio(460, 215)).toBe(false)
  })

  it('rejects a bare square community icon standing in for a missing cover', () => {
    // Heroes of the Storm: never listed on any storefront, so there is no
    // cover at all and the grid falls back to the exe-extracted icon.
    expect(isPortraitRatio(48, 48)).toBe(false)
  })

  it('accepts a landscape image only once it is meaningfully taller than wide', () => {
    expect(isPortraitRatio(100, 105)).toBe(false)
    expect(isPortraitRatio(100, 115)).toBe(true)
  })
})
