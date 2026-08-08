import { describe, expect, it } from 'vitest'
import { isInside, safeFileNameFromTitle } from './safePath'

describe('safeFileNameFromTitle', () => {
  it('leaves an ordinary game name alone', () => {
    expect(safeFileNameFromTitle('Ratchet & Clank: Up Your Arsenal')).toBe(
      'Ratchet & Clank Up Your Arsenal'
    )
  })

  it('keeps spaces, hyphens and ampersands', () => {
    expect(safeFileNameFromTitle('Half-Life 2 & Friends')).toBe('Half-Life 2 & Friends')
  })

  it('flattens path separators instead of letting them through', () => {
    expect(safeFileNameFromTitle('..\\..\\Windows\\System32')).toBe('.. .. Windows System32')
    expect(safeFileNameFromTitle('a/b')).toBe('a b')
  })

  it('strips characters Windows forbids', () => {
    expect(safeFileNameFromTitle('what? <yes> "no" |maybe|*')).toBe('what yes no maybe')
  })

  it('drops trailing dots and spaces, which Windows silently eats anyway', () => {
    expect(safeFileNameFromTitle('Portal 2.')).toBe('Portal 2')
    expect(safeFileNameFromTitle('Portal 2   ')).toBe('Portal 2')
  })

  it('falls back rather than returning an empty filename', () => {
    expect(safeFileNameFromTitle('***')).toBe('profile')
    expect(safeFileNameFromTitle('   ')).toBe('profile')
  })
})

describe('isInside', () => {
  it('accepts a path within the directory', () => {
    expect(isInside('C:\\data\\icons', 'C:\\data\\icons\\a.png')).toBe(true)
  })

  it('accepts the directory itself', () => {
    expect(isInside('C:\\data\\icons', 'C:\\data\\icons')).toBe(true)
  })

  it('rejects a traversal out of it', () => {
    expect(isInside('C:\\data\\icons', 'C:\\data\\icons\\..\\..\\evil.exe')).toBe(false)
  })

  it('rejects a sibling directory that merely shares a prefix', () => {
    expect(isInside('C:\\data\\icons', 'C:\\data\\icons-backup\\a.png')).toBe(false)
  })
})
