import { app, BrowserWindow, ipcMain } from 'electron'
import { IPC } from '@shared/ipcContract'
import { dataStore } from '../store/dataStore'
import { registerProfilesIpc } from './profiles.ipc'
import { registerTimerIpc } from './timer.ipc'
import { registerSettingsIpc } from './settings.ipc'
import { registerSystemIpc } from './system.ipc'
import { registerLegacyImportIpc } from './legacyImport.ipc'
import { registerImportExportIpc } from './importExport.ipc'
import { registerUpdaterIpc } from './updater.ipc'
import { registerFontsIpc } from './fonts.ipc'

/** Single place every ipcMain.handle/on registration goes through, so there's one spot to audit what's wired up. */
export function registerAllIpcHandlers(win: BrowserWindow): void {
  ipcMain.on(IPC.window.minimize, () => win.minimize())
  ipcMain.on(IPC.window.maximizeToggle, () => {
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on(IPC.window.close, () => win.close())

  ipcMain.handle(IPC.app.getVersion, () => app.getVersion())
  ipcMain.handle(IPC.app.getInitialData, () => dataStore.get())

  registerProfilesIpc(win)
  registerTimerIpc()
  registerSettingsIpc()
  registerSystemIpc()
  registerLegacyImportIpc(win)
  registerImportExportIpc(win)
  registerUpdaterIpc()
  registerFontsIpc()
}
