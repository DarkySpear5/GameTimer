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

  // `once`, not `on` — this only covers the very first paint at startup
  // (show: false + this listener is the standard flash-free-show pattern).
  // Later reloads (see loadAppContent, used to restore the app after it's
  // been unloaded to about:blank while parked in the tray) must NOT
  // auto-show the window, since a tray reload happens while still hidden.
  win.once('ready-to-show', () => win.show())

  win.on('maximize', () => win.webContents.send('window:maximizeChange', true))
  win.on('unmaximize', () => win.webContents.send('window:maximizeChange', false))

  /*
   * A frameless BrowserWindow (frame: false, needed for the custom title bar)
   * loses Chromium's usual guarantee that the compositor repaints in lockstep
   * with a live native resize drag on Windows — the surface can grow or shrink
   * faster than it repaints, leaving stale pixels from the old layout behind at
   * the new edge. It reads exactly like a layout bug (text or buttons visibly
   * cropped at the border) but is really a stale paint: the DOM underneath is
   * already correct, nothing is actually clipped or unreachable, invalidate()
   * just hasn't been asked to redraw it yet. Debounced so a drag firing dozens
   * of 'resize' events doesn't schedule dozens of full repaints.
   */
  let repaintTimer: ReturnType<typeof setTimeout> | null = null
  win.on('resize', () => {
    if (repaintTimer) clearTimeout(repaintTimer)
    repaintTimer = setTimeout(() => {
      repaintTimer = null
      if (!win.isDestroyed()) win.webContents.invalidate()
    }, 60)
  })

  // Anything the renderer tries to navigate to externally (e.g. an About-tab
  // link) opens in the OS browser instead of inside the app window.
  //
  // Restricted to http/https rather than passing the URL straight through:
  // shell.openExternal hands anything it is given to the OS handler for that
  // scheme, so file:, ms-msdt: and friends would be launched too. Nothing in
  // the renderer can produce such a URL today — every link is hardcoded — but
  // this is the one place where that would stop being true quietly.
  win.webContents.setWindowOpenHandler((details) => {
    try {
      const { protocol } = new URL(details.url)
      if (protocol === 'https:' || protocol === 'http:') void shell.openExternal(details.url)
    } catch {
      // not a URL at all — ignore it
    }
    return { action: 'deny' }
  })

  void loadAppContent(win)

  return win
}

/** Loads the real app UI into a window. Used both at startup and to restore the app after loadUrl('about:blank') unloaded it (see appLifecycle's tray hide/show). */
export function loadAppContent(win: BrowserWindow): Promise<void> {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  }
  return win.loadFile(join(__dirname, '../renderer/index.html'))
}
