import { Tray, Menu, nativeImage } from 'electron'
import { encodeRgbaPng } from './pngEncoder'
import { dataStore } from '../store/dataStore'
import { timerEngine } from '../timer/timerEngine'

type RgbaColor = [number, number, number, number]

// Functional colors carried over from v1's GREEN_RGBA/RED_RGBA — never themeable.
const GREEN_RGBA: RgbaColor = [166, 227, 161, 255]
const RED_RGBA: RgbaColor = [243, 139, 168, 255]
const BORDER_RGBA: RgbaColor = [30, 30, 46, 255]

function drawDot(color: RgbaColor): Buffer {
  const size = 32
  const rgba = Buffer.alloc(size * size * 4)
  const cx = size / 2
  const cy = size / 2
  const radius = size / 2 - 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5
      const dy = y - cy + 0.5
      const dist = Math.sqrt(dx * dx + dy * dy)
      const idx = (y * size + x) * 4
      let [r, g, b, a] = [0, 0, 0, 0]
      if (dist <= radius - 1.5) {
        ;[r, g, b, a] = color
      } else if (dist <= radius + 1.5) {
        const t = Math.min(1, Math.max(0, (radius + 1.5 - dist) / 3))
        r = BORDER_RGBA[0]
        g = BORDER_RGBA[1]
        b = BORDER_RGBA[2]
        a = Math.round(BORDER_RGBA[3] * t)
      }
      rgba[idx] = r
      rgba[idx + 1] = g
      rgba[idx + 2] = b
      rgba[idx + 3] = a
    }
  }
  return encodeRgbaPng(size, size, rgba)
}

interface TrayCallbacks {
  onShow: () => void
  onTogglePlaySelected: () => void
  onQuit: () => void
}

/**
 * Mirrors v1's pystray icon exactly: a colored status dot (green if
 * anything is running, red otherwise), a 3-item menu (Show / Play-Pause the
 * selected game / Quit), and a tooltip naming the selected game + its state.
 * Callers explicitly call refresh() after anything that changes running or
 * selected state (see ipc/timer.ipc.ts, ipc/profiles.ipc.ts) rather than
 * this service polling — it only needs to redraw on real state changes, not
 * every 500ms tick, matching v1's _update_tray_status() call sites.
 */
class TrayService {
  private tray: Tray | null = null
  private callbacks: TrayCallbacks | null = null

  start(callbacks: TrayCallbacks): void {
    if (this.tray) return
    this.callbacks = callbacks
    this.tray = new Tray(nativeImage.createFromBuffer(drawDot(RED_RGBA)))
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

    this.tray.setImage(nativeImage.createFromBuffer(drawDot(runningCount > 0 ? GREEN_RGBA : RED_RGBA)))

    let statusText: string
    if (runningCount > 1) statusText = `Tracking ${runningCount} games`
    else if (selectedIsRunning) statusText = 'Tracking time…'
    else statusText = 'Paused'
    this.tray.setToolTip(`Game Timer — ${selected ?? 'No profile selected'} (${statusText})`)

    const menu = Menu.buildFromTemplate([
      { label: 'Show Game Timer', click: () => this.callbacks?.onShow() },
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
