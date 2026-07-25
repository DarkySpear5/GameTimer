import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC } from '@shared/ipcContract'
import type { UpdateInfo, UpdateProgress } from '@shared/types'

let mainWindow: BrowserWindow | null = null
let configured = false

function configure(): void {
  if (configured) return
  configured = true
  autoUpdater.autoDownload = false // always ask first — see updater.ipc.ts's downloadUpdate handler
  autoUpdater.autoInstallOnAppQuit = false
  // Deliberately NOT forcing allowPrerelease here — electron-updater's own
  // default is "true if the running version itself has a prerelease tag,
  // else false", which is exactly right: a 2.0.0-beta.N install should keep
  // finding newer betas, but a stable 2.0.0 install should NOT get silently
  // offered a future risky beta.

  autoUpdater.on('update-available', (info) => {
    const payload: UpdateInfo = { version: info.version, releaseNotes: normalizeReleaseNotes(info.releaseNotes) }
    mainWindow?.webContents.send(IPC.updater.updateAvailable, payload)
  })
  autoUpdater.on('download-progress', (progress) => {
    const payload: UpdateProgress = { percent: progress.percent }
    mainWindow?.webContents.send(IPC.updater.downloadProgress, payload)
  })
  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send(IPC.updater.updateDownloaded)
  })
  // 'update-not-available' and 'error' are deliberately silent — a failed
  // or empty update check on launch must never interrupt or nag the user,
  // matching the rest of the app's "best-effort, never block" philosophy.
}

function normalizeReleaseNotes(
  notes: string | { version: string; note: string | null }[] | null | undefined
): string | null {
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) return notes.map((n) => n.note).filter(Boolean).join('\n\n') || null
  return null
}

export function registerUpdaterWindow(win: BrowserWindow): void {
  mainWindow = win
  configure()
}

/** Best-effort — never throws, never shows anything if there's nothing to report. */
export async function checkForUpdatesOnLaunch(): Promise<void> {
  if (!app.isPackaged) return // electron-updater no-ops in dev anyway; skip the log noise
  try {
    await autoUpdater.checkForUpdates()
  } catch {
    // network hiccup, no internet, whatever — silent, matches launch-time expectations
  }
}

export async function checkForUpdatesNow(): Promise<{ checked: boolean }> {
  if (!app.isPackaged) return { checked: false }
  try {
    await autoUpdater.checkForUpdates()
    return { checked: true }
  } catch (err) {
    console.error('[updater] checkForUpdates failed:', err)
    return { checked: false }
  }
}

export async function downloadUpdate(): Promise<void> {
  await autoUpdater.downloadUpdate()
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}
