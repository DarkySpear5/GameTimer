import { app, BrowserWindow, ipcMain } from 'electron'
import { IPC } from '@shared/ipcContract'

/**
 * Every ipcMain.handle/on registration lives behind this one entry point so
 * there's a single place to audit what's wired up. Domains (profiles, timer,
 * settings, etc.) get their own register* functions added here as the
 * corresponding main-process service is built out — this file currently only
 * wires window chrome + app metadata, since the data store/timer engine
 * (Task #3) haven't landed yet.
 */
export function registerAllIpcHandlers(win: BrowserWindow): void {
  ipcMain.on(IPC.window.minimize, () => win.minimize())
  ipcMain.on(IPC.window.maximizeToggle, () => {
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on(IPC.window.close, () => win.close())

  ipcMain.handle(IPC.app.getVersion, () => app.getVersion())
}
