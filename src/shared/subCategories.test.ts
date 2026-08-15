import { describe, expect, it } from 'vitest'
import { newSubCategory, creditSubCategory } from './subCategories'

describe('newSubCategory', () => {
  it('starts at zero seconds', () => {
    expect(newSubCategory('id-1', 'Casual')).toEqual({ id: 'id-1', name: 'Casual', seconds: 0 })
  })
})

describe('creditSubCategory', () => {
  const base = [newSubCategory('a', 'A'), newSubCategory('b', 'B')]

  it('adds the delta to the matching category only', () => {
    const result = creditSubCategory(base, 'a', 120)
    expect(result.find((c) => c.id === 'a')?.seconds).toBe(120)
    expect(result.find((c) => c.id === 'b')?.seconds).toBe(0)
  })

  it('adds on top of an existing total rather than overwriting it', () => {
    const withSome = creditSubCategory(base, 'a', 1800) // 30:00
    const result = creditSubCategory(withSome, 'a', 120) // +2:00
    expect(result.find((c) => c.id === 'a')?.seconds).toBe(1920) // 32:00, never resynced to some other total
  })

  it('does not mutate the input array', () => {
    const result = creditSubCategory(base, 'a', 60)
    expect(result).not.toBe(base)
    expect(base.find((c) => c.id === 'a')?.seconds).toBe(0)
  })

  it('is a no-op for an unknown id', () => {
    const result = creditSubCategory(base, 'nonexistent', 60)
    expect(result).toBe(base)
  })

  it('is a no-op for a zero or negative delta', () => {
    expect(creditSubCategory(base, 'a', 0)).toBe(base)
    expect(creditSubCategory(base, 'a', -5)).toBe(base)
  })
})
