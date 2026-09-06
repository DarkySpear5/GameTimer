import { useEffect, useId, useRef, useState } from 'react'
import type { TimeFormat } from '@shared/types'
import { formatSeconds } from '@shared/format'
import { visiblePlayHistoryBuckets, type PlayHistoryBucketSelection } from './playHistoryBuckets'
import './PlayHistoryChart.css'

const STANDARD_WIDTH = 640
const STANDARD_HEIGHT = 220
const COMPACT_WIDTH = 960
const COMPACT_HEIGHT = 180
const PLOT_LEFT = 64
const PLOT_RIGHT = 16

export interface PlayHistoryChartProps {
  title: string
  selection: PlayHistoryBucketSelection
  timeFormat: TimeFormat
  variant?: 'bars' | 'line'
  zoomable?: boolean
  /** Wide, shallow layout used only by the game-detail overview. */
  compact?: boolean
}

interface DisplayBar {
  key: string
  label: string
  accessibleLabel: string
  tooltip: string
  seconds: number
  baseline: boolean
}

export function PlayHistoryChart({
  title,
  selection,
  timeFormat,
  variant = 'bars',
  zoomable = false,
  compact = false
}: PlayHistoryChartProps): React.JSX.Element {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null)
  const [requestedBucketCount, setRequestedBucketCount] = useState<number | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [compactSize, setCompactSize] = useState({ width: COMPACT_WIDTH, height: COMPACT_HEIGHT })

  useEffect(() => {
    const svg = svgRef.current
    if (!compact || !svg) return
    const updateSize = (): void => {
      const { width, height } = svg.getBoundingClientRect()
      if (width > 0 && height > 0) setCompactSize({ width: Math.round(width), height: Math.round(height) })
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [compact])
  const width = compact ? compactSize.width : STANDARD_WIDTH
  const height = compact ? compactSize.height : STANDARD_HEIGHT
  const plotTop = compact ? Math.max(12, Math.round(height * 0.08)) : 16
  const plotBottom = compact ? Math.max(34, Math.round(height * 0.18)) : 44
  const titleId = `play-history-chart-title-${useId().replace(/:/g, '')}`
  const tooltipId = `play-history-chart-tooltip-${useId().replace(/:/g, '')}`
  const maximumBucketCount = selection.buckets.length
  const visibleBucketCount = Math.min(maximumBucketCount, Math.max(1, requestedBucketCount ?? maximumBucketCount))
  const displayedSelection = zoomable ? visiblePlayHistoryBuckets(selection, visibleBucketCount, selectedKey) : selection
  const bars = displayBars(displayedSelection, timeFormat)
  const yMaxSeconds = hourScale(Math.max(0, ...bars.map((bar) => bar.seconds)))
  const plotWidth = width - PLOT_LEFT - PLOT_RIGHT
  const plotHeight = height - plotTop - plotBottom
  const barStep = plotWidth / Math.max(1, bars.length)
  const barWidth = 24
  const labelEvery = Math.max(1, Math.ceil(bars.length / 8))
  const isLine = variant === 'line'
  const zoomStep = Math.max(1, Math.ceil(maximumBucketCount / 15))

  const zoomByWheel = (deltaY: number): void => {
    if (!zoomable || deltaY === 0) return
    const direction = Math.sign(deltaY)
    setRequestedBucketCount((previous) => {
      const current = Math.min(maximumBucketCount, Math.max(1, previous ?? maximumBucketCount))
      return Math.min(maximumBucketCount, Math.max(1, current + direction * zoomStep))
    })
  }

  const toggleSelectedDot = (bar: DisplayBar): void => {
    if (selectedKey === bar.key) {
      setSelectedKey(null)
      setActiveTooltip(null)
      return
    }
    setSelectedKey(bar.key)
    setActiveTooltip(bar.tooltip)
  }

  const defaultTooltip = zoomable
    ? `Showing ${visibleBucketCount} of ${maximumBucketCount} periods. Scroll up for fewer; down for more.`
    : 'Daily playtime is shown above.'

  return (
    <div className="play-history-chart">
      <svg
        ref={svgRef}
        className={`play-history-chart__svg${zoomable ? ' play-history-chart__svg--zoomable' : ''}`}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={titleId}
        aria-describedby={tooltipId}
        onMouseLeave={() => setActiveTooltip(null)}
        onWheel={zoomable ? (event) => {
          event.preventDefault()
          zoomByWheel(event.deltaY)
        } : undefined}
      >
        <title id={titleId}>{title}</title>
        <desc>Hours of recorded playtime by local calendar period.</desc>

        {[yMaxSeconds, yMaxSeconds / 2, 0].map((seconds) => {
          const y = plotY(seconds, yMaxSeconds, plotHeight, plotTop)
          const isZero = seconds === 0
          return (
            <g key={seconds} aria-hidden="true">
              <line className={isZero ? 'play-history-chart__zero-line' : 'play-history-chart__grid-line'} x1={PLOT_LEFT} x2={width - PLOT_RIGHT} y1={y} y2={y} />
              <text className="play-history-chart__y-label" x={PLOT_LEFT - 8} y={y + 4} textAnchor="end">{hoursLabel(seconds)}</text>
            </g>
          )
        })}

        {isLine && <polyline points={bars.map((bar, index) => `${PLOT_LEFT + index * barStep + barStep / 2},${plotY(bar.seconds, yMaxSeconds, plotHeight, plotTop)}`).join(' ')} fill="none" stroke="var(--gt-accent)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
        {isLine && bars.map((bar, index) => (
          <circle
            key={`point-${bar.key}`}
            className={`play-history-chart__point${selectedKey === bar.key ? ' play-history-chart__point--selected' : ''}`}
            cx={PLOT_LEFT + index * barStep + barStep / 2}
            cy={plotY(bar.seconds, yMaxSeconds, plotHeight, plotTop)}
            r="4"
            fill="var(--gt-accent)"
            stroke="var(--gt-panel)"
            strokeWidth="1.5"
            tabIndex={0}
            role="button"
            aria-label={bar.accessibleLabel}
            onClick={() => toggleSelectedDot(bar)}
            onFocus={() => setActiveTooltip(bar.tooltip)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                toggleSelectedDot(bar)
              }
            }}
          />
        ))}
        {bars.map((bar, index) => {
          const barHeight = Math.max(2, (bar.seconds / yMaxSeconds) * plotHeight)
          const x = PLOT_LEFT + index * barStep + (barStep - barWidth) / 2
          const y = plotTop + plotHeight - barHeight
          const showLabel = bar.baseline || index % labelEvery === 0 || index === bars.length - 1
          return (
            <g key={bar.key}>
              {!isLine && (
                <rect
                  className={`play-history-chart__bar${bar.baseline ? ' play-history-chart__bar--baseline' : ''}${bar.seconds === 0 ? ' play-history-chart__bar--zero' : ''}`}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx="0"
                  fill={bar.baseline ? 'var(--gt-accent)' : undefined}
                  pointerEvents="none"
                />
              )}
              {showLabel && <text className="play-history-chart__x-label" x={x + barWidth / 2} y={height - 14} textAnchor="middle" aria-hidden="true">{bar.label}</text>}
            </g>
          )
        })}
      </svg>
      <div id={tooltipId} className="play-history-chart__tooltip" role="status" aria-live="polite">
        {activeTooltip ?? (isLine ? (zoomable ? defaultTooltip : 'Select a dot to read its date and playtime.') : defaultTooltip)}
      </div>
    </div>
  )
}

function displayBars(selection: PlayHistoryBucketSelection, timeFormat: TimeFormat): DisplayBar[] {
  const baseline: DisplayBar[] = selection.baseline ? [{
    key: 'baseline',
    label: 'Today',
    accessibleLabel: `Today: ${formatSeconds(selection.baseline.seconds, timeFormat)} carried over from before daily tracking`,
    tooltip: `Today: ${formatSeconds(selection.baseline.seconds, timeFormat)} carried over from before daily tracking`,
    seconds: selection.baseline.seconds,
    baseline: true
  }] : []

  return [...baseline, ...selection.buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    accessibleLabel: `${bucket.label}: ${formatSeconds(bucket.seconds, timeFormat)}`,
    tooltip: `${bucket.label}: ${formatSeconds(bucket.seconds, timeFormat)}`,
    seconds: bucket.seconds,
    baseline: false
  }))]
}

function hourScale(seconds: number): number {
  const hours = Math.max(1, seconds / 3_600)
  const magnitude = 10 ** Math.floor(Math.log10(hours))
  const normalized = hours / magnitude
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return step * magnitude * 3_600
}

function plotY(seconds: number, maxSeconds: number, plotHeight: number, plotTop: number): number {
  return plotTop + plotHeight - (seconds / maxSeconds) * plotHeight
}

function hoursLabel(seconds: number): string {
  const hours = seconds / 3_600
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`
}