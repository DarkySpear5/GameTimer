import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('LibraryDetail', () => {
  it('does not expose the development sample-chart control', () => {
    const source = readFileSync(fileURLToPath(new URL('./LibraryDetail.tsx', import.meta.url)), 'utf8')

    expect(source).not.toContain('Show sample chart')
    expect(source).not.toContain('Show my data')
  })

  it('keeps the overview chart on real play-history data', () => {
    const source = readFileSync(fileURLToPath(new URL('./LibraryDetail.tsx', import.meta.url)), 'utf8')

    expect(source).toContain('<PlayHistoryChart title="Play history, last seven days" selection={selectPlayHistoryBuckets(profile.playHistory ?? emptyPlayHistory(), \'sevenDays\')} timeFormat={timeFormat} compact />')
  })
})