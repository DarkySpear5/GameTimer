import { join } from 'path'
import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window'
import { acquireSingleInstanceLock } from './singleInstance'
import { registerAllIpcHandlers } from './ipc/registerAll'
import { registerAssetSchemeAsPrivileged, registerAssetProtocolHandler } from './protocol'
import { dataStore } from './store/dataStore'
import { timerEngine } from './timer/timerEngine'
import { registerMainWindow, showWindow, quitApp } from './appLifecycle'
import { registerUpdaterWindow, checkForUpdatesOnLaunch } from './updater/autoUpdater'

let mainWindow: BrowserWindow | null = null

// Pins userData to the folder v2 has always used, independent of whatever
// the product is branded as (Electron otherwise derives this from the
// package name, which changed "gametimer" -> "gamut" in the Gamut rename —
// that silently pointed existing installs at a fresh, empty folder instead
// of their real data on the first launch after updating). Must run before
// anything else touches paths.ts/dataStore.
app.setPath('userData', join(app.getPath('appData'), 'gametimer'))

registerAssetSchemeAsPrivileged()

if (!acquireSingleInstanceLock(() => showWindow())) {
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
