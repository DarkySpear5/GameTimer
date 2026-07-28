import { app } from 'electron'

/**
 * Wraps Electron's built-in single-instance lock. Returns false if this
 * process lost the race (a first instance is already running) — the caller
 * should quit immediately in that case. The winning instance gets its window
 * shown (via the passed-in callback, not raw win.show()) whenever a second
 * launch is attempted — it must go through the same path the tray's "Show"
 * uses so a window unloaded to about:blank while parked in the tray gets
 * reloaded instead of popping up blank.
 */
export function acquireSingleInstanceLock(onSecondInstance: () => void): boolean {
  const gotLock = app.requestSingleInstanceLock()

  if (!gotLock) {
    return false
  }

  app.on('second-instance', () => onSecondInstance())

  return true
}
