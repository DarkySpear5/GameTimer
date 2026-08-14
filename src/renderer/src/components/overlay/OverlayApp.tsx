import { useEffect, useState } from 'react'
import { formatSeconds } from '@shared/format'
import { GREEN, RED } from '@shared/constants'
import type { OverlayTickPayload } from '@shared/ipcContract'

/**
 * O: the whole content of the overlay window — opened by overlayWindow.ts at
 * index.html#overlay. Transparent by design (the BrowserWindow itself is
 * transparent: true; this overrides the shared stylesheet's opaque body
 * background, which every OTHER window in this app wants).
 */
export function OverlayApp(): React.JSX.Element {
  const [state, setState] = useState<OverlayTickPayload | null>(null)

  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
  }, [])

  useEffect(() => window.api.overlay.onTick(setState), [])

  if (!state) return <div />

  const shadow = state.shadow ? '0 1px 3px rgba(0,0,0,0.9)' : undefined

  return (
    <div className="flex h-full items-center gap-2 px-3" style={{ fontSize: `${16 * state.scale}px` }}>
      <span
        className="shrink-0 rounded-full"
        style={{
          width: '0.6em',
          height: '0.6em',
          backgroundColor: state.running ? GREEN : RED,
          boxShadow: shadow
        }}
      />
      <span className="font-mono font-semibold text-white tabular-nums" style={{ textShadow: shadow }}>
        {formatSeconds(state.seconds)}
      </span>
    </div>
  )
}
