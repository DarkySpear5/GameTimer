import { useEffect, useState } from 'react'

/**
 * Custom Steam-style chrome for the frameless BrowserWindow (src/main/window.ts
 * sets frame:false) — the OS gives us no title bar at all, so drag region and
 * min/max/close controls are entirely our own.
 */
export function TitleBar(): React.JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => window.api.window.onMaximizeChange(setIsMaximized), [])

  return (
    <div
      className="flex h-9 shrink-0 items-center justify-between bg-panel select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="px-3 text-xs font-medium text-subtext">Game Timer</div>
      <div className="flex h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <TitleBarButton label="Minimize" onClick={() => window.api.window.minimize()}>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
          </svg>
        </TitleBarButton>
        <TitleBarButton label="Maximize" onClick={() => window.api.window.maximizeToggle()}>
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect
                x="1.5"
                y="0.5"
                width="7"
                height="7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
              <rect x="0.5" y="2.5" width="7" height="7" fill="var(--gt-panel)" />
              <rect
                x="0.5"
                y="2.5"
                width="7"
                height="7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect
                x="0.5"
                y="0.5"
                width="9"
                height="9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </svg>
          )}
        </TitleBarButton>
        <TitleBarButton label="Close" danger onClick={() => window.api.window.close()}>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="0.5" y1="0.5" x2="9.5" y2="9.5" stroke="currentColor" strokeWidth="1" />
            <line x1="9.5" y1="0.5" x2="0.5" y2="9.5" stroke="currentColor" strokeWidth="1" />
          </svg>
        </TitleBarButton>
      </div>
    </div>
  )
}

function TitleBarButton({
  label,
  danger,
  onClick,
  children
}: {
  label: string
  danger?: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={`flex w-11 items-center justify-center text-subtext transition-colors hover:text-text ${
        danger ? 'hover:bg-red hover:text-bg' : 'hover:bg-card'
      }`}
    >
      {children}
    </button>
  )
}
