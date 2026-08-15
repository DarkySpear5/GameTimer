import { app, BrowserWindow } from 'electron'
import { dataStore } from './store/dataStore'
import { timerEngine } from './timer/timerEngine'
import { writeStatusLog } from './statusLog/writeStatusLog'
import { trayService } from './tray/trayService'
import { loadAppContent } from './window'
import { IPC } from '@shared/ipcContract'
import { gameWatcher } from './detect/gameWatcher'

let mainWindow: BrowserWindow | null = null
let quitting = false
// True while the window is hidden in the tray with its content unloaded
// (about:blank) to free renderer memory (DOM/JS heap/image caches) — the
// window/webContents object itself stays alive so IPC handlers and dialog
// parenting elsewhere never need to deal with a recreated window. The React
// app always re-syncs fully from dataStore via getInitialData on reload, so
// nothing is lost by dropping the old page. The timer/checkpoint/autosave
// loop lives entirely in the main process and keeps running untouched.
let unloadedForTray = false

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
      unloadedForTray = true
      void win.loadURL('about:blank')
    }
  })

  timerEngine.onTick((payload) => {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return
    win.webContents.send(IPC.timer.tick, payload)
  })

  gameWatcher.onChange((names) => {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return
    win.webContents.send(IPC.detect.openGamesChanged, { open: names, unstoppable: gameWatcher.unstoppableNames() })
  })

  gameWatcher.onProfilesChanged((profiles) => {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return
    win.webContents.send(IPC.profiles.changed, profiles)
  })

  if (dataStore.get().settings.trayEnabled) {
    trayService.start(trayCallbacks)
  }
}

export function showWindow(): void {
  if (!mainWindow) return
  const win = mainWindow
  if (unloadedForTray) {
    unloadedForTray = false
    void loadAppContent(win).then(() => {
      if (win.isDestroyed()) return
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    })
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
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
