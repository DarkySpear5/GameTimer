import { Tray, Menu, nativeImage } from 'electron'
import { resolveAsset } from '../util/env'
import { dataStore } from '../store/dataStore'
import { timerEngine } from '../timer/timerEngine'
import { APP_DISPLAY_NAME } from '@shared/channel'

interface TrayCallbacks {
  onShow: () => void
  onTogglePlaySelected: () => void
  onQuit: () => void
}

/**
 * Tray icon is the app icon itself, with a green play-triangle badge
 * composited into the bottom-right corner while anything is running — no
 * badge at all when paused/idle. The two variants are pre-rendered PNGs
 * (see build/tray-idle.png / build/tray-running.png) rather than drawn at
 * runtime, since compositing a badge onto the real icon pixel-by-pixel isn't
 * worth doing in JS when ImageMagick already did it once at build time.
 * Callers explicitly call refresh() after anything that changes running or
 * selected state (see ipc/timer.ipc.ts, ipc/profiles.ipc.ts) rather than
 * this service polling — it only needs to redraw on real state changes, not
 * every 500ms tick, matching v1's _update_tray_status() call sites.
 */
class TrayService {
  private tray: Tray | null = null
  private callbacks: TrayCallbacks | null = null
  private idleIcon = nativeImage.createFromPath(resolveAsset('tray-idle.png'))
  private runningIcon = nativeImage.createFromPath(resolveAsset('tray-running.png'))

  start(callbacks: TrayCallbacks): void {
    if (this.tray) return
    this.callbacks = callbacks
    this.tray = new Tray(this.idleIcon)
    this.tray.on('click', () => this.callbacks?.onShow())
    this.refresh()
  }

  stop(): void {
    this.tray?.destroy()
    this.tray = null
    this.callbacks = null
  }

  get isActive(): boolean {
    return this.tray !== null
  }

  refresh(): void {
    if (!this.tray || !this.callbacks) return
    const runningCount = timerEngine.runningNames().length
    const selected = dataStore.get().lastSelected
    const selectedIsRunning = !!selected && timerEngine.isRunning(selected)

    this.tray.setImage(runningCount > 0 ? this.runningIcon : this.idleIcon)

    let statusText: string
    if (runningCount > 1) statusText = `Tracking ${runningCount} games`
    else if (selectedIsRunning) statusText = 'Tracking time…'
    else statusText = 'Paused'
    this.tray.setToolTip(`${APP_DISPLAY_NAME} — ${selected ?? 'No profile selected'} (${statusText})`)

    const menu = Menu.buildFromTemplate([
      { label: `Show ${APP_DISPLAY_NAME}`, click: () => this.callbacks?.onShow() },
      {
        label: selectedIsRunning ? 'Pause' : 'Play',
        enabled: !!selected,
        click: () => this.callbacks?.onTogglePlaySelected()
      },
      { type: 'separator' },
      { label: 'Quit', click: () => this.callbacks?.onQuit() }
    ])
    this.tray.setContextMenu(menu)
  }
}

export const trayService = new TrayService()
