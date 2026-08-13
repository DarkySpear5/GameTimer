import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipcContract'
import type { GameTimerApi, PopoutState, TimerTickPayload } from '@shared/ipcContract'
import type { UpdateInfo, UpdateProgress } from '@shared/types'

// Thin pass-through only — no logic belongs here. Every method just forwards
// to main over IPC; main is the sole owner of state and OS access.
const api: GameTimerApi = {
  profiles: {
    list: () => ipcRenderer.invoke(IPC.profiles.list),
    create: (name) => ipcRenderer.invoke(IPC.profiles.create, name),
    rename: (oldName, newName) => ipcRenderer.invoke(IPC.profiles.rename, oldName, newName),
    delete: (name) => ipcRenderer.invoke(IPC.profiles.delete, name),
    duplicate: (name) => ipcRenderer.invoke(IPC.profiles.duplicate, name),
    setStatus: (name, status) => ipcRenderer.invoke(IPC.profiles.setStatus, name, status),
    clearStatusRecord: (name) => ipcRenderer.invoke(IPC.profiles.clearStatusRecord, name),
    refreshArt: (name) => ipcRenderer.invoke(IPC.profiles.refreshArt, name),
    setAutoFetchArt: (name, value) => ipcRenderer.invoke(IPC.profiles.setAutoFetchArt, name, value),
    setGenres: (name, genres) => ipcRenderer.invoke(IPC.profiles.setGenres, name, genres),
    setRating: (name, rating) => ipcRenderer.invoke(IPC.profiles.setRating, name, rating),
    setFavorite: (name, favorite) => ipcRenderer.invoke(IPC.profiles.setFavorite, name, favorite),
    createNote: (name) => ipcRenderer.invoke(IPC.profiles.createNote, name),
    renameNote: (name, noteId, title) => ipcRenderer.invoke(IPC.profiles.renameNote, name, noteId, title),
    deleteNote: (name, noteId) => ipcRenderer.invoke(IPC.profiles.deleteNote, name, noteId),
    updateNoteBody: (name, noteId, body) =>
      ipcRenderer.invoke(IPC.profiles.updateNoteBody, name, noteId, body),
    updateNoteDrawing: (name, noteId, drawing) =>
      ipcRenderer.invoke(IPC.profiles.updateNoteDrawing, name, noteId, drawing),
    addRemoveTime: (name, deltaSeconds) => ipcRenderer.invoke(IPC.profiles.addRemoveTime, name, deltaSeconds),
    resetTime: (name) => ipcRenderer.invoke(IPC.profiles.resetTime, name),
    setIcon: (name) => ipcRenderer.invoke(IPC.profiles.setIcon, name),
    setBackground: (name, kind, value) =>
      ipcRenderer.invoke(IPC.profiles.setBackground, name, kind, value),
    clearBackground: (name) => ipcRenderer.invoke(IPC.profiles.clearBackground, name),
    select: (name) => ipcRenderer.invoke(IPC.profiles.select, name)
  },
  timer: {
    start: (name) => ipcRenderer.invoke(IPC.timer.start, name),
    pause: (name) => ipcRenderer.invoke(IPC.timer.pause, name),
    onTick: (cb) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: TimerTickPayload): void =>
        cb(payload)
      ipcRenderer.on(IPC.timer.tick, listener)
      return () => ipcRenderer.removeListener(IPC.timer.tick, listener)
    }
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settings.get),
    update: (patch) => ipcRenderer.invoke(IPC.settings.update, patch)
  },
  importExport: {
    exportProfile: (name) => ipcRenderer.invoke(IPC.importExport.exportProfile, name),
    importProfile: () => ipcRenderer.invoke(IPC.importExport.importProfile)
  },
  legacyImport: {
    detect: (force) => ipcRenderer.invoke(IPC.legacyImport.detect, force),
    run: (path) => ipcRenderer.invoke(IPC.legacyImport.run, path),
    skip: () => ipcRenderer.invoke(IPC.legacyImport.skip),
    browseForFile: () => ipcRenderer.invoke(IPC.legacyImport.browseForFile)
  },
  system: {
    setRunAtStartup: (enabled) => ipcRenderer.invoke(IPC.system.setRunAtStartup, enabled),
    setTrayEnabled: (enabled) => ipcRenderer.invoke(IPC.system.setTrayEnabled, enabled),
    quit: () => ipcRenderer.invoke(IPC.system.quit)
  },
  notes: {
    openPopout: (name, noteId) => ipcRenderer.invoke(IPC.notes.openPopout, name, noteId),
    getPopoutState: () => ipcRenderer.invoke(IPC.notes.getPopoutState),
    moveDrawing: (fromName, fromNoteId, toName, toNoteId) =>
      ipcRenderer.invoke(IPC.notes.moveDrawing, fromName, fromNoteId, toName, toNoteId),
    setViewedNote: (target) => ipcRenderer.send(IPC.notes.setViewedNote, target),
    setDropZone: (rect) => ipcRenderer.send(IPC.notes.setDropZone, rect),
    closePopoutWithFade: () => ipcRenderer.send(IPC.notes.closePopoutWithFade),
    onPopoutStateChanged: (cb) => {
      const listener = (_event: Electron.IpcRendererEvent, state: PopoutState | null): void => cb(state)
      ipcRenderer.on(IPC.notes.popoutState, listener)
      return () => ipcRenderer.removeListener(IPC.notes.popoutState, listener)
    },
    onDropDetected: (cb) => {
      const listener = (_event: Electron.IpcRendererEvent, target: { name: string; noteId: string }): void =>
        cb(target)
      ipcRenderer.on(IPC.notes.dropDetected, listener)
      return () => ipcRenderer.removeListener(IPC.notes.dropDetected, listener)
    },
    onDropZoneHover: (cb) => {
      const listener = (_event: Electron.IpcRendererEvent, hovering: boolean): void => cb(hovering)
      ipcRenderer.on(IPC.notes.dropZoneHover, listener)
      return () => ipcRenderer.removeListener(IPC.notes.dropZoneHover, listener)
    }
  },
  window: {
    minimize: () => ipcRenderer.send(IPC.window.minimize),
    maximizeToggle: () => ipcRenderer.send(IPC.window.maximizeToggle),
    close: () => ipcRenderer.send(IPC.window.close),
    onMaximizeChange: (cb) => {
      const listener = (_event: Electron.IpcRendererEvent, isMaximized: boolean): void =>
        cb(isMaximized)
      ipcRenderer.on(IPC.window.maximizeChange, listener)
      return () => ipcRenderer.removeListener(IPC.window.maximizeChange, listener)
    }
  },
  app: {
    getVersion: () => ipcRenderer.invoke(IPC.app.getVersion),
    getInitialData: () => ipcRenderer.invoke(IPC.app.getInitialData)
  },
  updater: {
    checkNow: () => ipcRenderer.invoke(IPC.updater.checkNow),
    downloadUpdate: () => ipcRenderer.invoke(IPC.updater.downloadUpdate),
    quitAndInstall: () => void ipcRenderer.invoke(IPC.updater.quitAndInstall),
    onUpdateAvailable: (cb) => {
      const listener = (_event: Electron.IpcRendererEvent, info: UpdateInfo): void => cb(info)
      ipcRenderer.on(IPC.updater.updateAvailable, listener)
      return () => ipcRenderer.removeListener(IPC.updater.updateAvailable, listener)
    },
    onDownloadProgress: (cb) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: UpdateProgress): void => cb(progress)
      ipcRenderer.on(IPC.updater.downloadProgress, listener)
      return () => ipcRenderer.removeListener(IPC.updater.downloadProgress, listener)
    },
    onUpdateDownloaded: (cb) => {
      const listener = (): void => cb()
      ipcRenderer.on(IPC.updater.updateDownloaded, listener)
      return () => ipcRenderer.removeListener(IPC.updater.updateDownloaded, listener)
    }
  },
  fonts: {
    list: () => ipcRenderer.invoke(IPC.fonts.list)
  },
  detect: {
    listRunning: () => ipcRenderer.invoke(IPC.detect.listRunning),
    identify: (exePath, windowTitle) => ipcRenderer.invoke(IPC.detect.identify, exePath, windowTitle),
    search: (query) => ipcRenderer.invoke(IPC.detect.search, query),
    createGame: (name, exePath, steamAppId) =>
      ipcRenderer.invoke(IPC.detect.createGame, name, exePath, steamAppId),
    launch: (name) => ipcRenderer.invoke(IPC.detect.launch, name),
    stop: (name) => ipcRenderer.invoke(IPC.detect.stop, name),
    openExeDirectory: (name) => ipcRenderer.invoke(IPC.detect.openExeDirectory, name),
    openGames: () => ipcRenderer.invoke(IPC.detect.openGames),
    onOpenGamesChanged: (cb) => {
      const listener = (_event: Electron.IpcRendererEvent, names: string[]): void => cb(names)
      ipcRenderer.on(IPC.detect.openGamesChanged, listener)
      return () => ipcRenderer.removeListener(IPC.detect.openGamesChanged, listener)
    },
    setAutoStartTimer: (name, value) =>
      ipcRenderer.invoke(IPC.detect.setAutoStartTimer, name, value),
    classify: (exePaths) => ipcRenderer.invoke(IPC.detect.classify, exePaths),
    artOptions: (name, steamAppId) => ipcRenderer.invoke(IPC.detect.artOptions, name, steamAppId),
    setArtFromUrl: (name, kind, url) =>
      ipcRenderer.invoke(IPC.detect.setArtFromUrl, name, kind, url),
    link: (name, exePath, steamAppId) => ipcRenderer.invoke(IPC.detect.link, name, exePath, steamAppId),
    unlink: (name) => ipcRenderer.invoke(IPC.detect.unlink, name),
    listInstalled: () => ipcRenderer.invoke(IPC.detect.listInstalled),
    importInstalled: (appIds) => ipcRenderer.invoke(IPC.detect.importInstalled, appIds),
    installedScanPending: () => ipcRenderer.invoke(IPC.detect.installedScanPending),
    skipInstalledScan: () => ipcRenderer.invoke(IPC.detect.skipInstalledScan),
    addGameFolder: () => ipcRenderer.invoke(IPC.detect.addGameFolder),
    removeGameFolder: (folder) => ipcRenderer.invoke(IPC.detect.removeGameFolder, folder),
    listGameFolders: () => ipcRenderer.invoke(IPC.detect.listGameFolders),
    setLauncherFolder: (source, clear) => ipcRenderer.invoke(IPC.detect.setLauncherFolder, source, clear),
    listLauncherFolders: () => ipcRenderer.invoke(IPC.detect.listLauncherFolders)
  }
}

contextBridge.exposeInMainWorld('api', api)
