import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { IPC } from '@shared/ipcContract'
import type { OverlayCorner } from '@shared/types'
import { dataStore } from '../store/dataStore'
import { timerEngine } from '../timer/timerEngine'
import { getForegroundGameWindow, resolveCurrentGame } from '../detect/foregroundWindow'
import { resolveAsset } from '../util/env'

/**
 * O: a small, transparent, click-through, always-on-top window showing
 * session time + a tracking dot over the currently focused, linked game.
 * Positioning is slow-polled (getForegroundGameWindow shells out to
 * PowerShell) but the displayed TIME piggybacks on the existing 500ms
 * timerEngine tick loop instead of its own poll — see pushTick.
 */
const BASE_WIDTH = 220
const BASE_HEIGHT = 56
const MARGIN = 16
const POLL_MS = 2000

let win: BrowserWindow | null = null
let pollHandle: ReturnType<typeof setInterval> | null = null
let currentName: string | null = null
let tickUnsubscribe: (() => void) | null = null

function ensureWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) return win
  win = new BrowserWindow({
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    // A small utility window has no business going OS-fullscreen — see
    // drawingPopout.ts's identical precedent and the fullscreen-lockout bug
    // it was added to fix.
    fullscreenable: false,
    show: false,
    icon: resolveAsset('icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  win.setIgnoreMouseEvents(true, { forward: true })
  const url = pathToFileURL(join(__dirname, '../renderer/index.html'))
  url.hash = 'overlay'
  void win.loadURL(url.toString())
  win.on('closed', () => {
    win = null
  })
  return win
}

function positionFor(bounds: Electron.Rectangle, corner: OverlayCorner, scale: number): Electron.Rectangle {
  const display = screen.getDisplayMatching(bounds)
  const width = Math.round(BASE_WIDTH * scale)
  const height = Math.round(BASE_HEIGHT * scale)
  const area = display.workArea
  const left = area.x + MARGIN
  const right = area.x + area.width - width - MARGIN
  const top = area.y + MARGIN
  const bottom = area.y + area.height - height - MARGIN
  const centerX = area.x + Math.round((area.width - width) / 2)
  const positions: Record<OverlayCorner, { x: number; y: number }> = {
    'top-left': { x: left, y: top },
    'top-right': { x: right, y: top },
    'top-center': { x: centerX, y: top },
    'bottom-left': { x: left, y: bottom },
    'bottom-right': { x: right, y: bottom },
    'bottom-center': { x: centerX, y: bottom }
  }
  const { x, y } = positions[corner]
  return { x, y, width, height }
}

async function poll(): Promise<void> {
  const { overlay } = dataStore.get().settings
  if (!overlay.enabled) {
    currentName = null
    if (win && !win.isDestroyed()) win.hide()
    return
  }
  const fg = await getForegroundGameWindow()
  const name = await resolveCurrentGame(fg)
  if (!name || !fg) {
    currentName = null
    if (win && !win.isDestroyed()) win.hide()
    return
  }
  currentName = name
  const w = ensureWindow()
  w.setBounds(positionFor(fg.bounds, overlay.corner, overlay.scale))
  // showInactive, never show() — stealing OS focus for the overlay would make
  // IT the foreground window on the next poll, hiding itself in a loop.
  w.showInactive()
}

function pushTick(running: Record<string, number>): void {
  if (!currentName || !win || win.isDestroyed() || win.webContents.isDestroyed()) return
  const { overlay } = dataStore.get().settings
  const profile = dataStore.get().profiles[currentName]
  const isRunning = currentName in running
  const seconds = isRunning ? running[currentName] : (profile?.seconds ?? 0)
  win.webContents.send(IPC.overlay.tick, {
    seconds,
    running: isRunning,
    scale: overlay.scale,
    shadow: overlay.shadow
  })
}

export const overlayWindow = {
  start(): void {
    if (pollHandle) return
    pollHandle = setInterval(() => void poll(), POLL_MS)
    void poll()
    tickUnsubscribe = timerEngine.onTick(({ running }) => pushTick(running))
  },

  stop(): void {
    if (pollHandle) clearInterval(pollHandle)
    pollHandle = null
    tickUnsubscribe?.()
    tickUnsubscribe = null
    if (win && !win.isDestroyed()) win.close()
    win = null
    currentName = null
  },

  /** Called by settingsService right after an overlay.* patch, so toggling/repositioning reacts immediately instead of waiting up to POLL_MS for the next tick. */
  onSettingsChanged(): void {
    void poll()
  }
}
