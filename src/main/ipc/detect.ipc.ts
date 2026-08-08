import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcContract'
import { listRunningApps } from '../detect/processList'
import { identify } from '../detect/identify'
import { searchSteamApps } from '../art/steamArt'
import { profileService } from '../store/profileService'
import { launchGame } from '../launch/gameLauncher'
import { classifyGames } from '../detect/classify'
import { getArtOptions } from '../art/artOptions'

/**
 * Detection itself is strictly read-only — it enumerates processes and reads
 * .acf files, and never kills or modifies anything. The two exceptions are
 * explicit user actions: createGame writes a profile, and launch starts a
 * game the user asked for.
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
  ipcMain.handle(IPC.detect.artOptions, (_e, name: string, steamAppId: number | null) =>
    getArtOptions(name, steamAppId)
  )
  ipcMain.handle(
    IPC.detect.setArtFromUrl,
    (_e, name: string, kind: 'icon' | 'background', url: string) =>
      profileService.setArtFromUrl(name, kind, url)
  )
  ipcMain.handle(IPC.detect.classify, (_e, exePaths: string[]) => classifyGames(exePaths))
  ipcMain.handle(IPC.detect.launch, (_e, name: string) => launchGame(name))
  ipcMain.handle(IPC.detect.setAutoStartTimer, (_e, name: string, value: boolean | null) =>
    profileService.setAutoStartTimer(name, value)
  )
  ipcMain.handle(IPC.profiles.refreshArt, (_e, name: string) => profileService.refreshArt(name))
  ipcMain.handle(IPC.profiles.setAutoFetchArt, (_e, name: string, value: boolean | null) =>
    profileService.setAutoFetchArt(name, value)
  )
}
