import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcContract'
import { checkForUpdatesNow, downloadUpdate, quitAndInstall } from '../updater/autoUpdater'

export function registerUpdaterIpc(): void {
  ipcMain.handle(IPC.updater.checkNow, () => checkForUpdatesNow())
  ipcMain.handle(IPC.updater.downloadUpdate, () => downloadUpdate())
  ipcMain.handle(IPC.updater.quitAndInstall, () => quitAndInstall())
}
