import { ipcMain, shell } from 'electron'
import { join } from 'path'
import { IPC } from '@shared/ipcContract'
import { listScreenshots } from '../screenshots/captureScreenshot'
import { paths } from '../store/paths'
import { isInside, isSafePngFileName } from '../util/safePath'

export function registerScreenshotsIpc(): void {
  ipcMain.handle(IPC.screenshots.list, (_e, name: string) => listScreenshots(name))
  ipcMain.handle(IPC.screenshots.open, async (_e, name: string, fileName: string) => {
    if (!isSafePngFileName(fileName)) return
    try {
      const dir = paths.screenshotsDir(name)
      const filePath = join(dir, fileName)
      if (!isInside(dir, filePath)) return
      await shell.openPath(filePath)
    } catch {
      // An invalid profile path has no corresponding screenshot to open.
    }
  })
}
