import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcContract'
import type { KeybindKind } from '@shared/ipcContract'
import { keybindService } from '../keybinds/keybindService'

/**
 * Real global hotkeys are OS-level input Playwright can't inject — this lets
 * a verify script exercise the exact same handler a real key press calls,
 * instead of a differently-behaved test double. Only registered when
 * GAMUT_TEST_APPDATA is set (the same flag every verify script already sets
 * to isolate its save data), so a real launch never registers this handler
 * at all.
 */
export function registerDevIpc(): void {
  if (!process.env.GAMUT_TEST_APPDATA) return
  ipcMain.handle(IPC.dev.triggerKeybind, (_e, kind: KeybindKind) => keybindService.trigger(kind))
}
