import { describe, expect, it } from 'vitest'
import { validateCombo } from './validateCombo'

describe('validateCombo', () => {
  it('accepts the punch list examples', () => {
    expect(validateCombo('Ctrl+2')).toBe(true)
    expect(validateCombo('Alt+F1')).toBe(true)
    expect(validateCombo('Alt+Home')).toBe(true)
    expect(validateCombo('Ctrl+Tab+Home')).toBe(true)
  })

  it('rejects a bare single key', () => {
    expect(validateCombo('F9')).toBe(false)
  })

  it('rejects a 2-key combo whose first key is not a modifier', () => {
    expect(validateCombo('2+Ctrl')).toBe(false)
    expect(validateCombo('A+B')).toBe(false)
  })

  it('rejects a 3-key combo that does not start Ctrl+Tab', () => {
    expect(validateCombo('Alt+Tab+Home')).toBe(false)
    expect(validateCombo('Ctrl+Shift+Home')).toBe(false)
  })

  it('rejects a combo longer than 3 keys', () => {
    expect(validateCombo('Ctrl+Tab+Shift+Home')).toBe(false)
  })

  it('rejects repeated keys', () => {
    expect(validateCombo('Ctrl+Ctrl')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(validateCombo('')).toBe(false)
  })
})
