import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcContract'
import { timerEngine } from '../timer/timerEngine'
import { trayService } from '../tray/trayService'

export function registerTimerIpc(): void {
  ipcMain.handle(IPC.timer.start, (_e, name: string) => {
    timerEngine.start(name)
    trayService.refresh()
  })
  ipcMain.handle(IPC.timer.pause, (_e, name: string) => {
    timerEngine.pause(name)
    trayService.refresh()
  })
}
