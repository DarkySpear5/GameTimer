import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '@shared/ipcContract'
import { exportProfile, importProfile } from '../importer/gtprofile'

export function registerImportExportIpc(win: BrowserWindow): void {
  ipcMain.handle(IPC.importExport.exportProfile, (_e, name: string) => exportProfile(win, name))
  ipcMain.handle(IPC.importExport.importProfile, () => importProfile(win))
}
