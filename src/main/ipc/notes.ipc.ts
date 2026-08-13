import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcContract'
import { drawingPopout } from '../notes/drawingPopout'
import { profileService } from '../store/profileService'

export function registerNotesIpc(): void {
  ipcMain.handle(IPC.notes.openPopout, (_e, name: string, noteId: string) =>
    drawingPopout.open(name, noteId)
  )
  ipcMain.handle(IPC.notes.getPopoutState, () => drawingPopout.getState())
  ipcMain.handle(IPC.notes.moveDrawing, async (_e, name: string, fromNoteId: string, toNoteId: string) => {
    const profile = await profileService.moveDrawing(name, fromNoteId, toNoteId)
    drawingPopout.retarget(toNoteId)
    return profile
  })
  ipcMain.on(IPC.notes.setViewedNote, (_e, target: { name: string; noteId: string } | null) =>
    drawingPopout.setViewedNote(target)
  )
  ipcMain.on(
    IPC.notes.setDropZone,
    (_e, rect: { x: number; y: number; width: number; height: number } | null) =>
      drawingPopout.setDropZone(rect)
  )
  ipcMain.on(IPC.notes.closePopoutWithFade, () => drawingPopout.closeWithFade())
}
