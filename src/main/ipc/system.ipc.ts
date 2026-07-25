import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcContract'
import { updateSettings } from '../store/settingsService'
import { quitApp } from '../appLifecycle'

export function registerSystemIpc(): void {
  ipcMain.handle(IPC.system.setRunAtStartup, (_e, enabled: boolean) => updateSettings({ runAtStartup: enabled }))
  ipcMain.handle(IPC.system.setTrayEnabled, (_e, enabled: boolean) => updateSettings({ trayEnabled: enabled }))
  ipcMain.handle(IPC.system.quit, () => quitApp())
}
