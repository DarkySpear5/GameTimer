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
import { gameWatcher } from './detect/gameWatcher'
import { keybindService } from './keybinds/keybindService'
import { USER_DATA_FOLDER, APP_USER_MODEL_ID } from '@shared/channel'

let mainWindow: BrowserWindow | null = null

// Pins userData to the folder v2 has always used, independent of whatever
// the product is branded as (Electron otherwise derives this from the
// package name, which changed "gametimer" -> "gamut" in the Gamut rename —
// that silently pointed existing installs at a fresh, empty folder instead
// of their real data on the first launch after updating). Must run before
// anything else touches paths.ts/dataStore.
//
// USER_DATA_FOLDER also keeps the dev channel's data in a separate folder, so
// a side-by-side dev install can never read or overwrite real save data.
app.setPath('userData', join(app.getPath('appData'), USER_DATA_FOLDER))

registerAssetSchemeAsPrivileged()

if (!acquireSingleInstanceLock(() => showWindow())) {
  app.quit()
} else {
  void app.whenReady().then(async () => {
    app.setAppUserModelId(APP_USER_MODEL_ID)

    await dataStore.load()
    registerAssetProtocolHandler()

    mainWindow = createMainWindow()
    registerAllIpcHandlers(mainWindow)
    registerMainWindow(mainWindow)
    registerUpdaterWindow(mainWindow)
    timerEngine.startLoop()
    // No-op unless the user opted into background watching — see gameWatcher.shouldRun.
    gameWatcher.sync()
    keybindService.registerAll()

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

  // An unregistered global hotkey would otherwise keep intercepting its
  // combo system-wide after the app has closed.
  app.on('will-quit', () => keybindService.unregisterAll())
}
