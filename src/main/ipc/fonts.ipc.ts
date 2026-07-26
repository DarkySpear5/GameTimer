import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcContract'
import { listFonts } from '../fonts/systemFonts'

export function registerFontsIpc(): void {
  ipcMain.handle(IPC.fonts.list, () => listFonts())
}
