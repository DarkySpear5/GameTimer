import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window'
import { acquireSingleInstanceLock } from './singleInstance'
import { registerAllIpcHandlers } from './ipc/registerAll'

let mainWindow: BrowserWindow | null = null

if (!acquireSingleInstanceLock(() => mainWindow)) {
  app.quit()
} else {
  void app.whenReady().then(() => {
    app.setAppUserModelId('com.darkyspear5.gametimer2')

    mainWindow = createMainWindow()
    registerAllIpcHandlers(mainWindow)
  })

  // Windows-only app (registry-based autostart, NSIS installer) — no macOS
  // dock-icon "activate" re-open behavior needed.
  app.on('window-all-closed', () => app.quit())
}
