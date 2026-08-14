import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcContract'
import type { KeybindKind } from '@shared/ipcContract'
import { validateCombo } from '@shared/validateCombo'
import { dataStore } from '../store/dataStore'
import { keybindService } from '../keybinds/keybindService'

export function registerKeybindsIpc(): void {
  ipcMain.handle(IPC.keybinds.set, (_e, kind: KeybindKind, combo: string) => {
    if (!validateCombo(combo)) return { ok: false, error: 'invalid_combo' as const }
    if (!keybindService.registerKind(kind, combo)) return { ok: false, error: 'register_failed' as const }
    const settings = dataStore.get().settings
    settings.keybinds = { ...settings.keybinds, [kind]: combo }
    void dataStore.safeSave()
    return { ok: true, settings }
  })
}
