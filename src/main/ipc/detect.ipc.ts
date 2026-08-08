import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcContract'
import { listRunningApps } from '../detect/processList'
import { identify } from '../detect/identify'
import { searchSteamApps } from '../art/steamArt'
import { profileService } from '../store/profileService'

/**
 * Everything here is read-only except createGame. Detection enumerates and
 * looks things up; it never launches, kills, or modifies anything on the
 * system.
 */
export function registerDetectIpc(): void {
  ipcMain.handle(IPC.detect.listRunning, () => listRunningApps())
  ipcMain.handle(IPC.detect.identify, (_e, exePath: string, windowTitle: string) =>
    identify(exePath, windowTitle)
  )
  ipcMain.handle(IPC.detect.search, (_e, query: string) => searchSteamApps(query))
  ipcMain.handle(
    IPC.detect.createGame,
    (_e, name: string, exePath: string | null, steamAppId: number | null) =>
      profileService.createDetected(name, exePath, steamAppId)
  )
  ipcMain.handle(IPC.profiles.refreshArt, (_e, name: string) => profileService.refreshArt(name))
  ipcMain.handle(IPC.profiles.setAutoFetchArt, (_e, name: string, value: boolean | null) =>
    profileService.setAutoFetchArt(name, value)
  )
}
