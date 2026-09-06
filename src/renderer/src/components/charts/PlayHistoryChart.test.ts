import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PlayHistoryChart } from './PlayHistoryChart'

describe('PlayHistoryChart', () => {
  it('renders an accessible zero-based SVG with focusable time-formatted bars', () => {
    const markup = renderToStaticMarkup(
      createElement(PlayHistoryChart, {
        title: 'Play history',
        timeFormat: 'units',
        selection: {
          baseline: null,
          buckets: [
            {
              key: '2026-09-04',
              label: '09/04',
              start: new Date(2026, 8, 4),
              end: new Date(2026, 8, 4),
              seconds: 1_800
            },
            {
              key: '2026-09-05',
              label: '09/05',
              start: new Date(2026, 8, 5),
              end: new Date(2026, 8, 5),
              seconds: 0
            }
          ]
        }
      })
    )

    expect(markup).toContain('role="img"')
    expect(markup).toContain('play-history-chart__zero-line')
    expect(markup).toContain('tabindex="0"')
    expect(markup).toContain('09/04')
    expect(markup).toContain('30m 0s')
    expect(markup).toContain('0h')
  })

  it('renders Earlier playtime as a separate striped, focusable baseline bar', () => {
    const markup = renderToStaticMarkup(
      createElement(PlayHistoryChart, {
        title: 'Play history',
        timeFormat: 'clock',
        selection: {
          baseline: { date: '2020-01-01', seconds: 5_400, tooltip: 'Earlier playtime' },
          buckets: [
            {
              key: '2026-09-05',
              label: '09/05',
              start: new Date(2026, 8, 5),
              end: new Date(2026, 8, 5),
              seconds: 0
            }
          ]
        }
      })
    )

    expect(markup).toContain('Earlier playtime')
    expect(markup).toContain('play-history-chart__bar--baseline')
    expect(markup).toContain('url(#play-history-chart-baseline-stripes)')
    expect(markup).toContain('01:30:00')
  })
})
