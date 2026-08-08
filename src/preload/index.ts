import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipcContract'
import type { GameTimerApi, TimerTickPayload } from '@shared/ipcContract'
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
    setGenres: (name, genres) => ipcRenderer.invoke(IPC.profiles.setGenres, name, genres),
    setRating: (name, rating) => ipcRenderer.invoke(IPC.profiles.setRating, name, rating),
    setNotes: (name, notes) => ipcRenderer.invoke(IPC.profiles.setNotes, name, notes),
    addRemoveTime: (name, deltaSeconds, note) =>
      ipcRenderer.invoke(IPC.profiles.addRemoveTime, name, deltaSeconds, note),
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
  }
}

contextBridge.exposeInMainWorld('api', api)
