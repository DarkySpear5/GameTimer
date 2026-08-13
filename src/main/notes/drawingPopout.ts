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
 * "Onto the note area" is simplified to "overlapping the main window at
 * all" — Electron's main process has no visibility into the renderer's DOM
 * layout, so it can't know the exact screen-space rectangle of a note's
 * canvas without new plumbing to report it continuously. Overlapping the
 * whole app window is what's actually buildable and verifiable, and matches
 * the common case (you drag it back toward the app you can see behind it).
 *
 * Only one pop-out can exist at a time — the note it's showing IS its
 * identity, so a second one would just be two windows fighting over which is
 * "the" detached drawing.
 */
let popoutWin: BrowserWindow | null = null
let state: PopoutState | null = null
let moveDebounce: ReturnType<typeof setTimeout> | null = null

/** Which note the main window's renderer is currently showing in NoteEditor, if any — pushed from NotesDialog. Used only to pick a drag-drop target; see setViewedNote. */
let viewedNote: { name: string; noteId: string } | null = null

const DROP_SETTLE_MS = 220

function broadcast(): void {
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

/**
 * Fires ~DROP_SETTLE_MS after the pop-out stops moving — the drag-release
 * detector. If it's now over the main window, tells the pop-out's OWN
 * renderer which note it landed on (its own, if the main window isn't
 * showing a different one of the same game) and leaves every decision from
 * there — confirm an overwrite, actually move the drawing, close itself — to
 * that renderer. That's what makes this identical in behavior to the "Move
 * to note" dropdown instead of a second, differently-behaved code path: both
 * end up calling the exact same handleMoveTo.
 */
function handleSettledDrop(): void {
  if (!popoutWin || popoutWin.isDestroyed() || !state) return
  const mainWin = mainWindowOf(popoutWin)
  if (!mainWin) return
  if (!rectsOverlap(popoutWin.getBounds(), mainWin.getBounds())) return

  const target =
    viewedNote && viewedNote.name === state.name && viewedNote.noteId !== state.noteId
      ? viewedNote.noteId
      : state.noteId // no different note in view -> reattach to its own

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
      broadcast()
    })

    broadcast()
    return { opened: true }
  },

  /** Called after moveDrawing succeeds — dropdown or drag alike — so the pop-out keeps tracking whichever note its content actually lives in now. */
  retarget(noteId: string): void {
    if (!state) return
    state = { name: state.name, noteId }
    broadcast()
  }
}
