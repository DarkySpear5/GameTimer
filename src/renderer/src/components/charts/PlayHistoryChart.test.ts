import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PlayHistoryChart } from './PlayHistoryChart'

const twoDays = [
  { key: '2026-09-04', label: '09/04', start: new Date(2026, 8, 4), end: new Date(2026, 8, 4), seconds: 1_800 },
  { key: '2026-09-05', label: '09/05', start: new Date(2026, 8, 5), end: new Date(2026, 8, 5), seconds: 0 }
]

describe('PlayHistoryChart', () => {
  it('renders a zero-based overview with square fixed-width non-interactive bars', () => {
    const markup = renderToStaticMarkup(createElement(PlayHistoryChart, {
      title: 'Play history',
      timeFormat: 'units',
      selection: { baseline: null, buckets: twoDays }
    }))

    expect(markup).toContain('role="img"')
    expect(markup).toContain('play-history-chart__zero-line')
    expect(markup).toContain('width="24"')
    expect(markup).toContain('rx="0"')
    expect(markup).toContain('pointer-events="none"')
    expect(markup).not.toContain('tabindex="0"')
  })

  it('renders selectable dots but no bar rectangles in the zoomable detail chart', () => {
    const markup = renderToStaticMarkup(createElement(PlayHistoryChart, {
      title: 'Play history',
      timeFormat: 'clock',
      variant: 'line',
      zoomable: true,
      selection: { baseline: { date: '2020-01-01', seconds: 5_400, tooltip: 'Earlier playtime' }, buckets: twoDays }
    }))

    expect(markup).toContain('Today')
    expect(markup).not.toContain('<rect')
    expect(markup).toContain('play-history-chart__point')
    expect(markup).toContain('tabindex="0"')
    expect(markup).toContain('Showing 2 of 2 periods. Scroll up for fewer; down for more.')
  })
})