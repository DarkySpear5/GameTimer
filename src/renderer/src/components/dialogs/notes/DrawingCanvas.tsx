import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DrawingStroke } from '@shared/notes'

const PEN_WIDTH = 2.5

/**
 * Relative (WCAG-ish) luminance from a `#rrggbb` string, used only to pick
 * black vs. white — the sRGB gamma-correct formula would be overkill for a
 * binary choice nobody will notice the difference on.
 */
function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!m) return 0
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** L2: the canvas background follows the active theme, and the default pen is whichever of black/white actually reads on it. */
function contrastingPen(): string {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--gt-card')
  return luminance(bg) > 0.5 ? '#000000' : '#ffffff'
}

const PALETTE = ['auto', '#f38ba8', '#a6e3a1', '#89b4fa', '#f9e2af'] as const

export function DrawingCanvas({
  strokes,
  onChange,
  toolbarExtra
}: {
  strokes: DrawingStroke[]
  onChange: (strokes: DrawingStroke[]) => void
  /** L3: where NoteEditor slots its "Pop out" button — kept generic here since this component has no opinion on pop-out at all. */
  toolbarExtra?: React.ReactNode
}): React.JSX.Element {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const drawingRef = useRef<DrawingStroke | null>(null)
  const [color, setColor] = useState<(typeof PALETTE)[number]>('auto')

  const penColor = color === 'auto' ? contrastingPen() : color

  // Mirrored into a ref so the ResizeObserver below — set up once, on mount —
  // always draws the CURRENT strokes. A plain closure captured at mount would
  // keep redrawing whatever `strokes` was on the first render forever after,
  // since the observer callback is never recreated when props change.
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes

  const redraw = useCallback((): void => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)
    const all = drawingRef.current ? [...strokesRef.current, drawingRef.current] : strokesRef.current
    for (const stroke of all) {
      if (stroke.points.length < 2) continue
      ctx.strokeStyle = stroke.color
      ctx.lineWidth = stroke.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(stroke.points[0].x * width, stroke.points[0].y * height)
      for (const p of stroke.points.slice(1)) ctx.lineTo(p.x * width, p.y * height)
      ctx.stroke()
    }
  }, [])

  // Backing store tracks the container's actual pixel size (times DPR, so
  // strokes stay crisp on a high-DPI display) — strokes themselves are stored
  // normalized 0..1, so a resize (windowed <-> popped-out) just redraws them
  // at the new size instead of warping or clipping.
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const dpr = window.devicePixelRatio || 1
    const observer = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      redraw()
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [redraw])

  useEffect(redraw, [redraw, strokes, color])

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>): void {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = { points: [pointFromEvent(e)], color: penColor, width: PEN_WIDTH }
    redraw()
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>): void {
    if (!drawingRef.current) return
    drawingRef.current.points.push(pointFromEvent(e))
    redraw()
  }

  function handlePointerUp(): void {
    const finished = drawingRef.current
    drawingRef.current = null
    // A tap with no real movement isn't a stroke worth keeping.
    if (finished && finished.points.length > 1) onChange([...strokes, finished])
    else redraw()
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        {PALETTE.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            title={c === 'auto' ? t('note_pen_auto') : c}
            className={`h-5 w-5 shrink-0 rounded-full ring-2 transition-transform ${
              color === c ? 'scale-110 ring-accent' : 'ring-transparent'
            }`}
            style={{
              backgroundColor: c === 'auto' ? contrastingPen() : c,
              // The auto swatch needs its own outline to read against a
              // same-colored canvas background — the others already contrast.
              outline: c === 'auto' ? '1px solid var(--gt-subtext)' : undefined
            }}
          />
        ))}
        <div className="ml-auto flex items-center gap-2">
          {toolbarExtra}
          <button
            onClick={() => onChange([])}
            disabled={strokes.length === 0}
            className="rounded bg-card px-2.5 py-1 text-xs text-subtext transition-opacity hover:text-text disabled:opacity-40"
          >
            {t('note_clear_drawing')}
          </button>
        </div>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden rounded bg-card">
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>
    </div>
  )
}
