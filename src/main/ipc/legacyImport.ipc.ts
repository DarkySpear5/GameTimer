import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC } from '@shared/ipcContract'
import { detectLegacyLibrary, runLegacyImport, skipLegacyImport } from '../importer/legacyImport'

export function registerLegacyImportIpc(win: BrowserWindow): void {
  ipcMain.handle(IPC.legacyImport.detect, (_e, force?: boolean) => detectLegacyLibrary(!!force))
  ipcMain.handle(IPC.legacyImport.run, (_e, path: string) => runLegacyImport(path))
  ipcMain.handle(IPC.legacyImport.skip, () => skipLegacyImport())

  ipcMain.handle(IPC.legacyImport.browseForFile, async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Locate your v1 game_timer_data.json',
      filters: [{ name: 'Game Timer data', extensions: ['json'] }],
      properties: ['openFile']
    })
    return result.canceled || !result.filePaths[0] ? null : result.filePaths[0]
  })
}
