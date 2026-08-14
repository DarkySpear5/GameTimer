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
// Sized to hug the actual content (a small dot + "HH:MM:SS", 24px font) with
// its own px-3 padding, not the window's own arbitrary box — the previous
// 330x84 was measured live as much bigger than the rendered content, which
// left the visible text floating in a lot of transparent dead space instead
// of sitting close to whichever corner/edge it was anchored to.
const BASE_WIDTH = 200
const BASE_HEIGHT = 40
// User feedback after trying it live: 16px read as "not close enough to the
// corner" next to Grim Dawn's own corner-hugging FPS counter — tightened to
// match that reference.
const MARGIN = 8
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
  // 'screen-saver' is the highest ordinary level — plain alwaysOnTop
  // ('floating') loses to other topmost windows and to a game that puts its
  // own window on top, which is exactly the case this has to win.
  win.setAlwaysOnTop(true, 'screen-saver')
  const url = pathToFileURL(join(__dirname, '../renderer/index.html'))
  url.hash = 'overlay'
  void win.loadURL(url.toString())
  win.on('closed', () => {
    win = null
  })
  return win
}

/**
 * Where the overlay sits, anchored to the GAME'S OWN WINDOW rather than to
 * the display.
 *
 * For a fullscreen or borderless game the two rects are the same, so this
 * changes nothing there — but for a WINDOWED game they can be nowhere near
 * each other, and anchoring to the display put the overlay somewhere the
 * player never looks. Measured on a real report: Forager windowed at
 * (242,415)-(1538,1174) on a 2560x1440 desktop, with the overlay parked at
 * the top-centre of the DESKTOP — visible, correct, and completely off the
 * game. "In-game overlay" has to mean on the game.
 *
 * `gameBounds` must already be in DIP (see poll's screenToDipRect call) —
 * the PowerShell probe reports physical pixels, and every Electron window
 * API here speaks DIP, so on a scaled display the two diverge.
 */
function positionFor(gameBounds: Electron.Rectangle, corner: OverlayCorner, scale: number): Electron.Rectangle {
  const width = Math.round(BASE_WIDTH * scale)
  const height = Math.round(BASE_HEIGHT * scale)
  const left = gameBounds.x + MARGIN
  const right = gameBounds.x + gameBounds.width - width - MARGIN
  const top = gameBounds.y + MARGIN
  const bottom = gameBounds.y + gameBounds.height - height - MARGIN
  const centerX = gameBounds.x + Math.round((gameBounds.width - width) / 2)
  const positions: Record<OverlayCorner, { x: number; y: number }> = {
    'top-left': { x: left, y: top },
    'top-right': { x: right, y: top },
    'top-center': { x: centerX, y: top },
    'bottom-left': { x: left, y: bottom },
    'bottom-right': { x: right, y: bottom },
    'bottom-center': { x: centerX, y: bottom }
  }
  const { x, y } = positions[corner]
  // Clamped to the full bounds of whichever display the game is on, so a
  // game window hanging off the edge of the screen can't drag the overlay to
  // somewhere the player can't see it either. Deliberately `.bounds`, not
  // `.workArea`: workArea excludes the taskbar's reserved strip, but a
  // borderless/fullscreen game legitimately covers that strip too (the
  // taskbar auto-hides behind it) — clamping to workArea pulled a
  // bottom-anchored overlay up off the game's true bottom edge by exactly
  // the taskbar's height. Measured live: Grim Dawn borderless at
  // (0,0)-(2560,1440) on a display whose workArea is only 1392 tall (48px
  // taskbar) put the overlay 32px above where bottom-right should land.
  const area = screen.getDisplayMatching(gameBounds).bounds
  return {
    x: Math.max(area.x, Math.min(x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(y, area.y + area.height - height)),
    width,
    height
  }
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
  // The PowerShell probe reports PHYSICAL pixels; every Electron window API
  // below speaks DIP. They're identical at 100% scaling — which is exactly
  // why this is easy to miss — and diverge on the very common 125%/150%
  // display, putting the overlay in the wrong place there.
  const gameBounds = screen.screenToDipRect(null, fg.bounds)
  w.setBounds(positionFor(gameBounds, overlay.corner, overlay.scale))
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
