import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface ContextMenuItem {
  label: string
  onClick: () => void
  danger?: boolean
  separatorBefore?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  /*
   * Measured after layout rather than estimated. The old clamp assumed every
   * item was 32px tall and ignored separators entirely, so a longer menu opened
   * near the bottom of the window ran off the edge and its last entries —
   * Delete among them — simply could not be clicked. Only the real height
   * knows, so the menu renders once invisibly, gets measured, then positions.
   */
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { offsetWidth: w, offsetHeight: h } = el
    const margin = 8
    setPos({
      left: Math.max(margin, Math.min(x, window.innerWidth - w - margin)),
      // Flip above the cursor when there isn't room below, which is what every
      // native menu does, rather than merely sliding up and covering the click.
      top: y + h + margin > window.innerHeight ? Math.max(margin, y - h) : y
    })
  }, [x, y, items.length])

  return (
    <div
      ref={ref}
      style={{ left: pos?.left ?? x, top: pos?.top ?? y, visibility: pos ? 'visible' : 'hidden' }}
      className="fixed z-50 w-44 rounded-lg bg-card py-1 shadow-2xl"
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.separatorBefore && <div className="my-1 h-px bg-panel" />}
          <button
            onClick={() => {
              item.onClick()
              onClose()
            }}
            className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-panel ${
              item.danger ? 'text-red' : 'text-text'
            }`}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  )
}
