import { app, BrowserWindow } from 'electron'

/**
 * Wraps Electron's built-in single-instance lock. Returns false if this
 * process lost the race (a first instance is already running) — the caller
 * should quit immediately in that case. The winning instance gets its window
 * focused/restored whenever a second launch is attempted.
 */
export function acquireSingleInstanceLock(getWindow: () => BrowserWindow | null): boolean {
  const gotLock = app.requestSingleInstanceLock()

  if (!gotLock) {
    return false
  }

  app.on('second-instance', () => {
    const win = getWindow()
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })

  return true
}
