import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcContract'
import { dataStore } from '../store/dataStore'
import { updateSettings } from '../store/settingsService'
import type { Settings } from '@shared/types'

export function registerSettingsIpc(): void {
  ipcMain.handle(IPC.settings.get, () => dataStore.get().settings)
  ipcMain.handle(IPC.settings.update, (_e, patch: Partial<Settings>) => updateSettings(patch))
}
