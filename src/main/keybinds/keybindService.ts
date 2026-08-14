import { BrowserWindow, globalShortcut } from 'electron'
import { IPC } from '@shared/ipcContract'
import type { KeybindKind } from '@shared/ipcContract'
import { dataStore } from '../store/dataStore'
import { timerEngine } from '../timer/timerEngine'
import { trayService } from '../tray/trayService'
import { getForegroundGameWindow, resolveCurrentGame } from '../detect/foregroundWindow'
import { captureScreenshot } from '../screenshots/captureScreenshot'

export type { KeybindKind } from '@shared/ipcContract'

function broadcastToast(code: string, kind: 'info' | 'error', params?: Record<string, string>): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue
    win.webContents.send(IPC.toast.show, { code, kind, params })
  }
}

/** "Ctrl+2" (validateCombo's stored/display shape) -> Electron's accelerator format — the only token that differs. */
function toAccelerator(combo: string): string {
  return combo
    .split('+')
    .map((token) => (token === 'Ctrl' ? 'CommandOrControl' : token))
    .join('+')
}

const registeredCombos = new Map<KeybindKind, string>()

export const keybindService = {
  /**
   * The one handler both a real OS-level hotkey press and the
   * GAMUT_TEST_APPDATA dev IPC hook (see ipc/dev.ipc.ts) call — a Playwright
   * verify script exercises the exact same path a real key press does.
   * Resolves the "current game" itself: a linked profile's window must be
   * OS-focused (see foregroundWindow.ts's resolveCurrentGame) — not gated on
   * the timer already running, since that would make start/pause only ever
   * able to pause.
   */
  async trigger(kind: KeybindKind): Promise<void> {
    const fg = await getForegroundGameWindow()
    const name = await resolveCurrentGame(fg)
    if (!name || !fg) return

    if (kind === 'startPauseTimer') {
      if (timerEngine.isRunning(name)) timerEngine.pause(name)
      else timerEngine.start(name)
      trayService.refresh()
      return
    }

    try {
      const result = await captureScreenshot(name, fg)
      broadcastToast(result.fallback ? 'screenshot_fallback' : 'screenshot_saved', 'info', { name })
    } catch {
      broadcastToast('screenshot_failed', 'error', { name })
    }
  },

  /** Registers one keybind, replacing any previous registration for the same kind. Returns false if the OS/another app already owns the combo — surfaced to the Keybinds tab as an inline error, never swallowed. */
  registerKind(kind: KeybindKind, combo: string): boolean {
    const previous = registeredCombos.get(kind)
    if (previous) globalShortcut.unregister(toAccelerator(previous))
    const ok = globalShortcut.register(toAccelerator(combo), () => void keybindService.trigger(kind))
    if (ok) registeredCombos.set(kind, combo)
    else registeredCombos.delete(kind)
    return ok
  },

  /** Called once at startup with whatever's currently saved. */
  registerAll(): void {
    const { keybinds } = dataStore.get().settings
    keybindService.registerKind('startPauseTimer', keybinds.startPauseTimer)
    keybindService.registerKind('saveScreenshot', keybinds.saveScreenshot)
  },

  /** Called on quit — an unregistered global hotkey would otherwise keep intercepting the combo system-wide after the app closes. */
  unregisterAll(): void {
    globalShortcut.unregisterAll()
    registeredCombos.clear()
  }
}
