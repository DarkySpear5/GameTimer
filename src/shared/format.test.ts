import { describe, expect, it } from 'vitest'
import { formatSeconds } from './format'

describe('formatSeconds', () => {
  const duration = 26 * 60 * 60 + 14 * 60 + 42

  it('shows elapsed days as total hours in clock format', () => {
    expect(formatSeconds(duration, 'clock')).toBe('26:14:42')
  })

  it('shows elapsed time in compact units format', () => {
    expect(formatSeconds(duration, 'units')).toBe('1d 2h 14m 42s')
  })
})
