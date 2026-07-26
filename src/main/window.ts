import { join } from 'path'
import { BrowserWindow, shell } from 'electron'
import { is, resolveAsset } from './util/env'

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 860,
    minHeight: 560,
    show: false,
    frame: false,
    backgroundColor: '#1e1e2e',
    icon: resolveAsset('icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.on('maximize', () => win.webContents.send('window:maximizeChange', true))
  win.on('unmaximize', () => win.webContents.send('window:maximizeChange', false))

  // Anything the renderer tries to navigate to externally (e.g. an About-tab
  // link) opens in the OS browser instead of inside the app window.
  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
