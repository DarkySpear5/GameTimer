import { BrowserWindow } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { IPC } from '@shared/ipcContract'
import type { PopoutState } from '@shared/ipcContract'
import { resolveAsset } from '../util/env'

/**
 * L3: the drawing pop-out, scoped down from the punch list's literal
 * "drag the window onto a note to reattach" — that needs continuous
 * cross-window OS drag-position tracking, which is fragile and impossible to
 * verify without a human physically dragging a window on their own screen.
 * This delivers the same two outcomes a different way: closing the pop-out
 * reattaches to its own note automatically (see the 'closed' handler), and
 * NoteEditor's "Move to note" control (backed by moveDrawing) covers moving
 * it to a different one, with an overwrite confirm in the renderer.
 *
 * Only one pop-out can exist at a time — the note it's showing IS its
 * identity, so a second one would just be two windows fighting over which is
 * "the" detached drawing.
 */
let popoutWin: BrowserWindow | null = null
let state: PopoutState | null = null

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue
    win.webContents.send(IPC.notes.popoutState, state)
  }
}

export const drawingPopout = {
  getState(): PopoutState | null {
    return state
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

    popoutWin.on('closed', () => {
      popoutWin = null
      state = null
      broadcast()
    })

    broadcast()
    return { opened: true }
  },

  /** Called after moveDrawing succeeds, so the pop-out keeps tracking whichever note its content actually lives in now. */
  retarget(noteId: string): void {
    if (!state) return
    state = { name: state.name, noteId }
    broadcast()
  }
}
