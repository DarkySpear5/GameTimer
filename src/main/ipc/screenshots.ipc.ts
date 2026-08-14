import { ipcMain, shell } from 'electron'
import { IPC } from '@shared/ipcContract'
import { listScreenshots } from '../screenshots/captureScreenshot'

export function registerScreenshotsIpc(): void {
  ipcMain.handle(IPC.screenshots.list, (_e, name: string) => listScreenshots(name))
  ipcMain.handle(IPC.screenshots.open, (_e, filePath: string) => shell.openPath(filePath))
}
