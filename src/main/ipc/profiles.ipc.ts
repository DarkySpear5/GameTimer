import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC } from '@shared/ipcContract'
import { profileService } from '../store/profileService'
import { trayService } from '../tray/trayService'

const IMAGE_FILTERS = [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'webp'] }]

export function registerProfilesIpc(win: BrowserWindow): void {
  ipcMain.handle(IPC.profiles.list, () => profileService.list())
  ipcMain.handle(IPC.profiles.create, (_e, name: string) => profileService.create(name))
  ipcMain.handle(IPC.profiles.rename, (_e, oldName: string, newName: string) =>
    profileService.rename(oldName, newName)
  )
  ipcMain.handle(IPC.profiles.delete, (_e, name: string) => profileService.delete(name))
  ipcMain.handle(IPC.profiles.duplicate, (_e, name: string) => profileService.duplicate(name))
  ipcMain.handle(IPC.profiles.setStatus, (_e, name, status, overrideSeconds?: number) =>
    profileService.setStatus(name, status, overrideSeconds)
  )
  ipcMain.handle(IPC.profiles.clearStatusRecord, (_e, name: string) =>
    profileService.clearStatusRecord(name)
  )
  ipcMain.handle(IPC.profiles.setGenres, (_e, name, genres) => profileService.setGenres(name, genres))
  ipcMain.handle(IPC.profiles.setRating, (_e, name, rating) => profileService.setRating(name, rating))
  ipcMain.handle(IPC.profiles.setFavorite, (_e, name: string, favorite: boolean) =>
    profileService.setFavorite(name, Boolean(favorite))
  )
  ipcMain.handle(IPC.profiles.createSubCategory, (_e, name: string, categoryName: string) =>
    profileService.createSubCategory(name, categoryName)
  )
  ipcMain.handle(
    IPC.profiles.renameSubCategory,
    (_e, name: string, categoryId: string, newName: string) =>
      profileService.renameSubCategory(name, categoryId, newName)
  )
  ipcMain.handle(IPC.profiles.deleteSubCategory, (_e, name: string, categoryId: string) =>
    profileService.deleteSubCategory(name, categoryId)
  )
  ipcMain.handle(
    IPC.profiles.setSubCategoriesEnabled,
    (_e, name: string, value: boolean | null) => profileService.setSubCategoriesEnabled(name, value)
  )
  ipcMain.handle(IPC.profiles.assignSubCategorySession, (_e, name: string, categoryId: string) =>
    profileService.assignSubCategorySession(name, categoryId)
  )
  ipcMain.handle(IPC.profiles.createNote, (_e, name: string) => profileService.createNote(name))
  ipcMain.handle(IPC.profiles.renameNote, (_e, name: string, noteId: string, title: string) =>
    profileService.renameNote(name, noteId, title)
  )
  ipcMain.handle(IPC.profiles.deleteNote, (_e, name: string, noteId: string) =>
    profileService.deleteNote(name, noteId)
  )
  ipcMain.handle(IPC.profiles.updateNoteBody, (_e, name: string, noteId: string, body: string) =>
    profileService.updateNoteBody(name, noteId, body)
  )
  ipcMain.handle(IPC.profiles.updateNoteDrawing, (_e, name: string, noteId: string, drawing) =>
    profileService.updateNoteDrawing(name, noteId, drawing)
  )
  ipcMain.handle(IPC.profiles.addRemoveTime, (_e, name, deltaSeconds) =>
    profileService.addRemoveTime(name, deltaSeconds)
  )
  ipcMain.handle(IPC.profiles.resetTime, (_e, name: string) => profileService.resetTime(name))
  ipcMain.handle(IPC.profiles.clearBackground, (_e, name: string) => profileService.clearBackground(name))

  ipcMain.handle(IPC.profiles.select, async (_e, name: string | null) => {
    await profileService.select(name)
    trayService.refresh()
  })

  ipcMain.handle(IPC.profiles.setIcon, async (_e, name: string) => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose an icon image',
      filters: IMAGE_FILTERS,
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return null
    return profileService.setIconFile(name, result.filePaths[0])
  })

  ipcMain.handle(IPC.profiles.setBackground, async (_e, name: string, kind: 'image' | 'color', value: string) => {
    if (kind === 'color') {
      return profileService.setBackgroundColor(name, value)
    }
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose a background image',
      filters: IMAGE_FILTERS,
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return null
    return profileService.setBackgroundImage(name, result.filePaths[0])
  })
}
