import { useEffect } from 'react'
import type { ReactNode } from 'react'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  width?: string
  /**
   * Actions pinned below the scrolling body. A dialog's confirm button must
   * stay reachable on a short window — left inside `children` it scrolls away
   * with everything else, which is how "Add 12 games" became unclickable.
   */
  footer?: ReactNode
}

export function Modal({
  title,
  onClose,
  children,
  width = 'max-w-md',
  footer
}: ModalProps): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={`flex max-h-[85vh] w-full ${width} flex-col rounded-xl bg-panel shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-card px-5 py-3.5">
          <div className="text-sm font-semibold text-text">{title}</div>
          {/* p-2 -m-2: grows the hit target well past the tiny 14x14 icon
              (reported hard to click) without shifting it visually — the
              negative margin cancels the padding's outward push. */}
          <button onClick={onClose} className="-m-2 p-2 text-subtext hover:text-text" aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 10 10">
              <line x1="0.5" y1="0.5" x2="9.5" y2="9.5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="9.5" y1="0.5" x2="0.5" y2="9.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="shrink-0 border-t border-card px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}
