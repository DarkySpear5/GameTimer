import { BrowserWindow } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { IPC } from '@shared/ipcContract'
import type { PopoutState } from '@shared/ipcContract'
import { resolveAsset } from '../util/env'

/**
 * L3: the drawing pop-out.
 *
 * Reattaching is real drag detection, not the click-only fallback this
 * shipped with first — Electron fires a native 'move' event for the pop-out
 * window during an actual OS-level drag (and, usefully for testing, for a
 * scripted setBounds() sequence too, since both go through the same
 * WM_WINDOWPOSCHANGED path on Windows). There's no distinct "drag end"
 * event, so a short quiet period after the last 'move' is what stands in for
 * "the user let go" — good enough for a window drag, which doesn't move
 * every millisecond the way a mouse does mid-motion.
 *
 * The drop target is a specific zone (NoteEditor's drawing area, live canvas
 * or its placeholder), not "anywhere on the main window" — that first
 * version measured correctly but felt imprecise to actually use, dragging a
 * whole small window onto a whole big one. The renderer reports that zone's
 * rect relative to its own content area (setDropZone); this module converts
 * it to screen coordinates using the main window's CURRENT position at
 * comparison time, which is what lets the renderer report it only when the
 * zone's SIZE changes (not track the main window being moved around too).
 *
 * Only one pop-out can exist at a time — the note it's showing IS its
 * identity, so a second one would just be two windows fighting over which is
 * "the" detached drawing.
 */
let popoutWin: BrowserWindow | null = null
let state: PopoutState | null = null
let moveDebounce: ReturnType<typeof setTimeout> | null = null
let hovering = false

/** Which note the main window's renderer is currently showing in NoteEditor, if any — pushed from NotesDialog. Used to pick a drag-drop target; see setViewedNote. */
let viewedNote: { name: string; noteId: string } | null = null

/** NoteEditor's drawing-zone rect, relative to the main window's OWN content area — see setDropZone. */
let dropZoneRelative: { x: number; y: number; width: number; height: number } | null = null

const DROP_SETTLE_MS = 220
const FADE_STEPS = 6
const FADE_STEP_MS = 25

function broadcastState(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue
    win.webContents.send(IPC.notes.popoutState, state)
  }
}

function rectsOverlap(a: Electron.Rectangle, b: Electron.Rectangle): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function mainWindowOf(popout: BrowserWindow): BrowserWindow | null {
  return BrowserWindow.getAllWindows().find((w) => w !== popout && !w.isDestroyed()) ?? null
}

/** The drop zone in screen coordinates, right now — null if nothing has reported one (no note editor currently on screen). */
function absoluteDropZone(mainWin: BrowserWindow): Electron.Rectangle | null {
  if (!dropZoneRelative) return null
  const content = mainWin.getContentBounds()
  return {
    x: content.x + dropZoneRelative.x,
    y: content.y + dropZoneRelative.y,
    width: dropZoneRelative.width,
    height: dropZoneRelative.height
  }
}

function setHovering(next: boolean, mainWin: BrowserWindow): void {
  if (next === hovering) return
  hovering = next
  if (!mainWin.isDestroyed() && !mainWin.webContents.isDestroyed()) {
    mainWin.webContents.send(IPC.notes.dropZoneHover, hovering)
  }
}

function clearHover(): void {
  if (!hovering) return
  hovering = false
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue
    win.webContents.send(IPC.notes.dropZoneHover, false)
  }
}

/**
 * Fires ~DROP_SETTLE_MS after the pop-out stops moving — the drag-release
 * detector. If it's now over the drop zone, tells the pop-out's OWN renderer
 * which note (and which GAME — the main window can be showing a note that
 * belongs to a completely different game from the one popped out) it landed
 * on, and leaves every decision from there — confirm an overwrite, actually
 * move the drawing, close itself — to that renderer. That's what makes this
 * identical in behavior to the "Move to note" dropdown instead of a second,
 * differently-behaved code path: both end up calling the exact same
 * handleMoveTo.
 */
function handleSettledDrop(): void {
  if (!popoutWin || popoutWin.isDestroyed() || !state) return
  // Maximizing (the button, or double-clicking the title bar) fires the same
  // 'move'/'resize' events a real drag does, and trivially overlaps the drop
  // zone since it now covers the whole screen — clicking maximize to get more
  // room to draw is not a request to reattach. isMaximized() is exactly the
  // signal to tell the two apart: a real drag onto the zone can never leave
  // the window in that state.
  if (popoutWin.isMaximized()) return
  const mainWin = mainWindowOf(popoutWin)
  if (!mainWin) return
  const zone = absoluteDropZone(mainWin)
  if (!zone || !rectsOverlap(popoutWin.getBounds(), zone)) return

  // Any note in view is a valid target, same game or a different one — no
  // different note in view (list view, or nothing to do with notes at all)
  // falls back to reattaching to its own.
  const target: { name: string; noteId: string } =
    viewedNote && viewedNote.noteId !== state.noteId ? viewedNote : state

  if (!popoutWin.webContents.isDestroyed()) {
    popoutWin.webContents.send(IPC.notes.dropDetected, target)
  }
}

export const drawingPopout = {
  getState(): PopoutState | null {
    return state
  },

  setViewedNote(target: { name: string; noteId: string } | null): void {
    viewedNote = target
  },

  setDropZone(rect: { x: number; y: number; width: number; height: number } | null): void {
    dropZoneRelative = rect
    if (!rect && popoutWin && !popoutWin.isDestroyed()) clearHover()
  },

  /** The merge animation for a successful drag-drop — see closePopoutWithFade's doc comment on the IPC contract for why the escape hatch deliberately does NOT go through this. */
  closeWithFade(): void {
    if (!popoutWin || popoutWin.isDestroyed()) return
    const win = popoutWin
    let step = 0
    const timer = setInterval(() => {
      step++
      if (win.isDestroyed()) {
        clearInterval(timer)
        return
      }
      win.setOpacity(Math.max(0, 1 - step / FADE_STEPS))
      if (step >= FADE_STEPS) {
        clearInterval(timer)
        if (!win.isDestroyed()) win.close()
      }
    }, FADE_STEP_MS)
  },

  /** False only when a DIFFERENT note is already popped out — the caller (NoteEditor) hides its own button in that case rather than needing to handle this as a surprise. */
  open(name: string, noteId: string): { opened: boolean } {
    if (popoutWin && !popoutWin.isDestroyed()) {
      if (state?.name === name && state.noteId === noteId) {
        popoutWin.focus()
        return { opened: true }
      }
      return { opened: false }
    }

    state = { name, noteId }
    popoutWin = new BrowserWindow({
      width: 420,
      height: 480,
      minWidth: 280,
      minHeight: 280,
      title: 'Gamut — Drawing',
      icon: resolveAsset('icon.ico'),
      backgroundColor: '#1e1e2e',
      // A small utility window has no business going OS-fullscreen — no
      // frame, no taskbar, and (measured directly) no obvious way back out
      // short of guessing that Escape or Alt+F4 will save you. Blocking it
      // outright is safer than trying to add an in-app escape hatch for a
      // state the window should never enter in the first place.
      fullscreenable: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })

    const url = pathToFileURL(join(__dirname, '../renderer/index.html'))
    url.search = `?profile=${encodeURIComponent(name)}&note=${encodeURIComponent(noteId)}`
    url.hash = 'drawing-popout'
    void popoutWin.loadURL(url.toString())

    popoutWin.on('move', () => {
      // Live hover feedback — checked on every move, not just the debounced
      // settle, so the target highlights DURING the drag rather than only
      // reacting after the fact. Suppressed while maximized for the same
      // reason handleSettledDrop ignores it below — maximizing isn't a drag,
      // and highlighting the zone for it would be a false promise.
      const win = popoutWin
      const mainWin = win && mainWindowOf(win)
      if (win && mainWin) {
        const zone = absoluteDropZone(mainWin)
        setHovering(!win.isMaximized() && !!zone && rectsOverlap(win.getBounds(), zone), mainWin)
      }

      if (moveDebounce) clearTimeout(moveDebounce)
      moveDebounce = setTimeout(() => {
        moveDebounce = null
        handleSettledDrop()
      }, DROP_SETTLE_MS)
    })

    popoutWin.on('closed', () => {
      popoutWin = null
      state = null
      if (moveDebounce) clearTimeout(moveDebounce)
      moveDebounce = null
      clearHover()
      broadcastState()
    })

    broadcastState()
    return { opened: true }
  },

  /** Called after moveDrawing succeeds — dropdown or drag alike, same game or a different one — so the pop-out keeps tracking whichever note (and game) its content actually lives in now. */
  retarget(name: string, noteId: string): void {
    if (!state) return
    state = { name, noteId }
    broadcastState()
  }
}
