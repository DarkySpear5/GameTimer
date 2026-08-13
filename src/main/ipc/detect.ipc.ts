import { ipcMain, dialog } from 'electron'
import { dataStore } from '../store/dataStore'
import { IPC } from '@shared/ipcContract'
import { listRunningApps } from '../detect/processList'
import { identify } from '../detect/identify'
import { searchSteamApps } from '../art/steamArt'
import { profileService } from '../store/profileService'
import { launchGame, stopGame, openExeDirectory } from '../launch/gameLauncher'
import { gameWatcher } from '../detect/gameWatcher'
import { classifyGames } from '../detect/classify'
import { getArtOptions } from '../art/artOptions'
import { listInstalledGames, importInstalledGames } from '../detect/installedGames'
import { readFirstRunState, updateFirstRunState } from '../importer/firstRun'

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
  ipcMain.handle(IPC.detect.link, (_e, name: string, exePath: string, steamAppId: number | null) =>
    profileService.linkExecutable(name, exePath, steamAppId)
  )
  ipcMain.handle(IPC.detect.unlink, (_e, name: string) => profileService.unlinkExecutable(name))
  ipcMain.handle(IPC.detect.listInstalled, () => {
    const s = dataStore.get().settings
    return listInstalledGames(s.extraGameFolders, s.launcherFolders)
  })
  ipcMain.handle(IPC.detect.importInstalled, async (_e, ids: unknown) => {
    // The renderer supplies this list, so it is filtered to real strings here
    // rather than trusted — importInstalledGames only ever matches these
    // against ids the scan itself produced, but validating at the boundary is
    // where it belongs.
    const wanted = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
    const s = dataStore.get().settings
    const result = await importInstalledGames(wanted, s.extraGameFolders, s.launcherFolders)
    await updateFirstRunState({ installedScanState: 'imported' })
    return result
  })
  /**
   * Adds a folder to scan. The path comes from Electron's own directory
   * chooser, never from the renderer, so there is nothing here to validate —
   * the user picked it themselves.
   */
  ipcMain.handle(IPC.detect.addGameFolder, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    const folder = result.filePaths[0]
    const settings = dataStore.get().settings
    if (!settings.extraGameFolders.some((f) => f.toLowerCase() === folder.toLowerCase())) {
      settings.extraGameFolders = [...settings.extraGameFolders, folder]
      await dataStore.safeSave()
    }
    return folder
  })
  ipcMain.handle(IPC.detect.removeGameFolder, async (_e, folder: string) => {
    const settings = dataStore.get().settings
    settings.extraGameFolders = settings.extraGameFolders.filter(
      (f) => f.toLowerCase() !== String(folder).toLowerCase()
    )
    await dataStore.safeSave()
  })
  ipcMain.handle(IPC.detect.listGameFolders, () => dataStore.get().settings.extraGameFolders)
  /**
   * Points one launcher at a folder. Passing null clears it and returns to
   * automatic detection — which is why clearing has to be possible: a wrong
   * folder must never be a dead end.
   */
  ipcMain.handle(IPC.detect.setLauncherFolder, async (_e, source: string, clear?: boolean) => {
    const settings = dataStore.get().settings
    const next = { ...settings.launcherFolders }
    if (clear) {
      delete next[source as keyof typeof next]
    } else {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
      if (result.canceled || !result.filePaths[0]) return settings.launcherFolders
      next[source as keyof typeof next] = result.filePaths[0]
    }
    settings.launcherFolders = next
    await dataStore.safeSave()
    return next
  })
  ipcMain.handle(IPC.detect.listLauncherFolders, () => dataStore.get().settings.launcherFolders)
  ipcMain.handle(IPC.detect.installedScanPending, async () => {
    const state = await readFirstRunState()
    return !state?.installedScanState
  })
  ipcMain.handle(IPC.detect.skipInstalledScan, () =>
    updateFirstRunState({ installedScanState: 'skipped' })
  )
  ipcMain.handle(IPC.detect.classify, (_e, exePaths: string[]) => classifyGames(exePaths))
  ipcMain.handle(IPC.detect.launch, (_e, name: string) => launchGame(name))
  ipcMain.handle(IPC.detect.stop, (_e, name: string) => stopGame(name))
  ipcMain.handle(IPC.detect.openExeDirectory, (_e, name: string) => openExeDirectory(name))
  ipcMain.handle(IPC.detect.openGames, () => gameWatcher.openNames())
  ipcMain.handle(IPC.detect.setAutoStartTimer, (_e, name: string, value: boolean | null) =>
    profileService.setAutoStartTimer(name, value)
  )
  ipcMain.handle(IPC.profiles.refreshArt, (_e, name: string) => profileService.refreshArt(name))
  ipcMain.handle(IPC.profiles.setAutoFetchArt, (_e, name: string, value: boolean | null) =>
    profileService.setAutoFetchArt(name, value)
  )
}
