import { useEffect, useRef } from 'react'

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

  const clampedX = Math.min(x, window.innerWidth - 180)
  const clampedY = Math.min(y, window.innerHeight - items.length * 32 - 16)

  return (
    <div
      ref={ref}
      style={{ left: clampedX, top: clampedY }}
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
