import { app, BrowserWindow } from 'electron'
import { dataStore } from './store/dataStore'
import { timerEngine } from './timer/timerEngine'
import { writeStatusLog } from './statusLog/writeStatusLog'
import { trayService } from './tray/trayService'
import { IPC } from '@shared/ipcContract'

let mainWindow: BrowserWindow | null = null
let quitting = false

const trayCallbacks = {
  onShow: showWindow,
  onTogglePlaySelected: toggleSelectedPlay,
  onQuit: () => void quitApp()
}

/** Wires window close-to-tray behavior and starts the tray if settings say to. Call once after creating the window. */
export function registerMainWindow(win: BrowserWindow): void {
  mainWindow = win

  win.on('close', (event) => {
    if (quitting) return
    const { trayEnabled } = dataStore.get().settings
    if (trayEnabled && trayService.isActive) {
      event.preventDefault()
      win.hide()
    }
  })

  timerEngine.onTick((payload) => {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return
    win.webContents.send(IPC.timer.tick, payload)
  })

  if (dataStore.get().settings.trayEnabled) {
    trayService.start(trayCallbacks)
  }
}

export function showWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

export function toggleSelectedPlay(): void {
  const selected = dataStore.get().lastSelected
  if (!selected) return
  if (timerEngine.isRunning(selected)) timerEngine.pause(selected)
  else timerEngine.start(selected)
  trayService.refresh()
}

/** Starts/stops the tray to match a live settings change (Settings dialog toggling it). */
export function syncTrayEnabled(enabled: boolean): void {
  if (enabled && !trayService.isActive) {
    trayService.start(trayCallbacks)
  } else if (!enabled && trayService.isActive) {
    trayService.stop()
  }
}

/**
 * Every step here is best-effort — a failure in any one (disk full, file
 * locked by antivirus, etc.) must never prevent the app from actually
 * quitting. Mirrors v1's _quit_app() exactly.
 */
export async function quitApp(): Promise<void> {
  if (quitting) return
  quitting = true
  try {
    timerEngine.stopLoop()
  } catch {
    /* noop */
  }
  try {
    timerEngine.pauseAll()
  } catch {
    /* noop */
  }
  try {
    await dataStore.save()
  } catch {
    /* noop */
  }
  try {
    await writeStatusLog()
  } catch {
    /* noop */
  }
  try {
    trayService.stop()
  } catch {
    /* noop */
  }
  app.quit()
}
