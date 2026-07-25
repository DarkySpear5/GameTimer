import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window'
import { acquireSingleInstanceLock } from './singleInstance'
import { registerAllIpcHandlers } from './ipc/registerAll'
import { registerAssetSchemeAsPrivileged, registerAssetProtocolHandler } from './protocol'
import { dataStore } from './store/dataStore'
import { timerEngine } from './timer/timerEngine'
import { registerMainWindow, quitApp } from './appLifecycle'
import { registerUpdaterWindow, checkForUpdatesOnLaunch } from './updater/autoUpdater'

let mainWindow: BrowserWindow | null = null

registerAssetSchemeAsPrivileged()

if (!acquireSingleInstanceLock(() => mainWindow)) {
  app.quit()
} else {
  void app.whenReady().then(async () => {
    app.setAppUserModelId('com.darkyspear5.gametimer2')

    await dataStore.load()
    registerAssetProtocolHandler()

    mainWindow = createMainWindow()
    registerAllIpcHandlers(mainWindow)
    registerMainWindow(mainWindow)
    registerUpdaterWindow(mainWindow)
    timerEngine.startLoop()

    if (dataStore.get().settings.checkForUpdates) {
      void checkForUpdatesOnLaunch()
    }
  })

  // Windows-only app (registry-based autostart, NSIS installer) — no macOS
  // dock-icon "activate" re-open behavior needed. The window may already be
  // hidden-to-tray rather than destroyed, so this only fires once the tray
  // itself has also been torn down (quitApp() closes it before app.quit()).
  app.on('window-all-closed', () => {
    if (!mainWindow || mainWindow.isDestroyed()) void quitApp()
  })
}
