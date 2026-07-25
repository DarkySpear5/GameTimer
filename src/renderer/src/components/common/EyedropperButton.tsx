/**
 * Chromium's EyeDropper API — unlike a plain <input type="color">'s own
 * swatch picker (which can be flaky about sampling outside the app window),
 * this opens a real system-wide screen-color-sampling overlay: the user can
 * click the taskbar, desktop, another app's icon, anywhere on screen, and
 * it returns that exact pixel's color.
 */
export function EyedropperButton({ onPick }: { onPick: (hex: string) => void }): React.JSX.Element | null {
  if (typeof window === 'undefined' || !window.EyeDropper) return null

  async function pick(): Promise<void> {
    try {
      const eyeDropper = new window.EyeDropper!()
      const result = await eyeDropper.open()
      onPick(result.sRGBHex)
    } catch {
      // user pressed Escape / canceled the pick — no-op
    }
  }

  return (
    <button
      type="button"
      onClick={() => void pick()}
      title="Pick a color from anywhere on screen"
      aria-label="Eyedropper"
      className="flex items-center justify-center rounded bg-card p-1.5 text-text hover:bg-card/70"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m2 22 1-4 9.5-9.5" />
        <path d="m13.5 7.5 3 3" />
        <path d="M17.5 2.5a2.121 2.121 0 0 1 3 3L17 9l-3-3Z" />
      </svg>
    </button>
  )
}
