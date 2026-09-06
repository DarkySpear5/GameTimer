import { useId, useState } from 'react'
import type { TimeFormat } from '@shared/types'
import { formatSeconds } from '@shared/format'
import type { PlayHistoryBucketSelection } from './playHistoryBuckets'
import './PlayHistoryChart.css'

const WIDTH = 640
const HEIGHT = 280
const PLOT_LEFT = 48
const PLOT_RIGHT = 16
const PLOT_TOP = 16
const PLOT_BOTTOM = 52
const BASELINE_PATTERN_ID = 'play-history-chart-baseline-stripes'

export interface PlayHistoryChartProps {
  title: string
  selection: PlayHistoryBucketSelection
  /** Supplied by the existing time-format preference hook at the call site. */
  timeFormat: TimeFormat
}

interface DisplayBar {
  key: string
  label: string
  accessibleLabel: string
  tooltip: string
  seconds: number
  baseline: boolean
}

/**
 * A dependency-free SVG chart. Calendar aggregation lives in the pure selector;
 * this component only renders the supplied buckets and the explicitly separate
 * pre-ledger baseline.
 */
export function PlayHistoryChart({ title, selection, timeFormat }: PlayHistoryChartProps): React.JSX.Element {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null)
  const titleId = `play-history-chart-title-${useId().replace(/:/g, '')}`
  const tooltipId = `play-history-chart-tooltip-${useId().replace(/:/g, '')}`
  const bars = displayBars(selection, timeFormat)
  const yMaxSeconds = hourScale(Math.max(0, ...bars.map((bar) => bar.seconds)))
  const plotWidth = WIDTH - PLOT_LEFT - PLOT_RIGHT
  const plotHeight = HEIGHT - PLOT_TOP - PLOT_BOTTOM
  const barStep = plotWidth / Math.max(1, bars.length)
  const barWidth = Math.max(2, Math.min(30, barStep * 0.68))
  const labelEvery = Math.max(1, Math.ceil(bars.length / 8))

  return (
    <div className="play-history-chart">
      <svg
        className="play-history-chart__svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby={titleId}
        aria-describedby={tooltipId}
        onMouseLeave={() => setActiveTooltip(null)}
      >
        <title id={titleId}>{title}</title>
        <desc>Hours of recorded playtime by local calendar period. Bars can be focused for their exact duration.</desc>
        <defs>
          <pattern id={BASELINE_PATTERN_ID} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="var(--gt-accent)" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="var(--gt-panel)" strokeWidth="3" />
          </pattern>
        </defs>

        {[yMaxSeconds, yMaxSeconds / 2, 0].map((seconds) => {
          const y = plotY(seconds, yMaxSeconds, plotHeight)
          const isZero = seconds === 0
          return (
            <g key={seconds} aria-hidden="true">
              <line
                className={isZero ? 'play-history-chart__zero-line' : 'play-history-chart__grid-line'}
                x1={PLOT_LEFT}
                x2={WIDTH - PLOT_RIGHT}
                y1={y}
                y2={y}
              />
              <text className="play-history-chart__y-label" x={PLOT_LEFT - 8} y={y + 4} textAnchor="end">
                {hoursLabel(seconds)}
              </text>
            </g>
          )
        })}

        {bars.map((bar, index) => {
          const height = Math.max(2, (bar.seconds / yMaxSeconds) * plotHeight)
          const x = PLOT_LEFT + index * barStep + (barStep - barWidth) / 2
          const y = PLOT_TOP + plotHeight - height
          const showLabel = bar.baseline || index % labelEvery === 0 || index === bars.length - 1
          return (
            <g key={bar.key}>
              <rect
                className={`play-history-chart__bar${bar.baseline ? ' play-history-chart__bar--baseline' : ''}${bar.seconds === 0 ? ' play-history-chart__bar--zero' : ''}`}
                x={x}
                y={y}
                width={barWidth}
                height={height}
                rx="2"
                fill={bar.baseline ? `url(#${BASELINE_PATTERN_ID})` : undefined}
                tabIndex={0}
                aria-label={bar.accessibleLabel}
                aria-describedby={tooltipId}
                onFocus={() => setActiveTooltip(bar.tooltip)}
                onBlur={() => setActiveTooltip(null)}
                onMouseEnter={() => setActiveTooltip(bar.tooltip)}
              >
                <title>{bar.tooltip}</title>
              </rect>
              {showLabel && (
                <text className="play-history-chart__x-label" x={x + barWidth / 2} y={HEIGHT - 20} textAnchor="middle" aria-hidden="true">
                  {bar.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <div id={tooltipId} className="play-history-chart__tooltip" role="status" aria-live="polite">
        {activeTooltip ?? 'Focus a bar to read its playtime.'}
      </div>
    </div>
  )
}

function displayBars(selection: PlayHistoryBucketSelection, timeFormat: TimeFormat): DisplayBar[] {
  const baseline: DisplayBar[] = selection.baseline
    ? [
        {
          key: 'baseline',
          label: 'Earlier',
          accessibleLabel: `${selection.baseline.tooltip}: ${formatSeconds(selection.baseline.seconds, timeFormat)}`,
          tooltip: selection.baseline.tooltip,
          seconds: selection.baseline.seconds,
          baseline: true
        }
      ]
    : []

  return [
    ...baseline,
    ...selection.buckets.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      accessibleLabel: `${bucket.label}: ${formatSeconds(bucket.seconds, timeFormat)}`,
      tooltip: `${bucket.label}: ${formatSeconds(bucket.seconds, timeFormat)}`,
      seconds: bucket.seconds,
      baseline: false
    }))
  ]
}

function hourScale(seconds: number): number {
  const hours = Math.max(1, seconds / 3_600)
  const magnitude = 10 ** Math.floor(Math.log10(hours))
  const normalized = hours / magnitude
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return step * magnitude * 3_600
}

function plotY(seconds: number, maxSeconds: number, plotHeight: number): number {
  return PLOT_TOP + plotHeight - (seconds / maxSeconds) * plotHeight
}

function hoursLabel(seconds: number): string {
  const hours = seconds / 3_600
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`
}
