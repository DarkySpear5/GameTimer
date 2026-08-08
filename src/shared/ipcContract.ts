import type {
  AppData,
  GtProfileFile,
  LegacyDetectResult,
  Profile,
  Settings,
  Status,
  UpdateInfo,
  UpdateProgress
} from './types'

/**
 * Channel name constants — single source of truth so main/ipc/*.ts and the
 * preload bridge can never drift into a stringly-typed typo.
 */
export const IPC = {
  profiles: {
    list: 'profiles:list',
    create: 'profiles:create',
    rename: 'profiles:rename',
    delete: 'profiles:delete',
    duplicate: 'profiles:duplicate',
    setStatus: 'profiles:setStatus',
    clearStatusRecord: 'profiles:clearStatusRecord',
    setGenres: 'profiles:setGenres',
    setRating: 'profiles:setRating',
    setNotes: 'profiles:setNotes',
    addRemoveTime: 'profiles:addRemoveTime',
    resetTime: 'profiles:resetTime',
    setIcon: 'profiles:setIcon',
    setBackground: 'profiles:setBackground',
    clearBackground: 'profiles:clearBackground',
    select: 'profiles:select'
  },
  timer: {
    start: 'timer:start',
    pause: 'timer:pause',
    tick: 'timer:tick'
  },
  settings: {
    get: 'settings:get',
    update: 'settings:update'
  },
  importExport: {
    exportProfile: 'importExport:exportProfile',
    importProfile: 'importExport:importProfile'
  },
  legacyImport: {
    detect: 'legacyImport:detect',
    run: 'legacyImport:run',
    skip: 'legacyImport:skip',
    browseForFile: 'legacyImport:browseForFile'
  },
  system: {
    setRunAtStartup: 'system:setRunAtStartup',
    setTrayEnabled: 'system:setTrayEnabled',
    quit: 'system:quit'
  },
  window: {
    minimize: 'window:minimize',
    maximizeToggle: 'window:maximizeToggle',
    close: 'window:close',
    maximizeChange: 'window:maximizeChange'
  },
  app: {
    getVersion: 'app:getVersion',
    getInitialData: 'app:getInitialData'
  },
  updater: {
    checkNow: 'updater:checkNow',
    downloadUpdate: 'updater:downloadUpdate',
    quitAndInstall: 'updater:quitAndInstall',
    updateAvailable: 'updater:updateAvailable',
    downloadProgress: 'updater:downloadProgress',
    updateDownloaded: 'updater:updateDownloaded'
  },
  fonts: {
    list: 'fonts:list'
  }
} as const

export interface TimerTickPayload {
  running: Record<string, number>
}

/**
 * The typed surface the preload script exposes as `window.api`. Kept here
 * (not in preload) so main's IPC handlers and the renderer's usage sites are
 * checked against the exact same shape.
 */
export interface GameTimerApi {
  profiles: {
    list(): Promise<Profile[]>
    create(name: string): Promise<Profile>
    rename(oldName: string, newName: string): Promise<Profile>
    delete(name: string): Promise<void>
    duplicate(name: string): Promise<Profile>
    setStatus(name: string, status: Status): Promise<Profile>
    /** Irreversibly clears the completion/dropped snapshot. Confirm with the user before calling. */
    clearStatusRecord(name: string): Promise<Profile>
    setGenres(name: string, genres: string[]): Promise<Profile>
    setRating(name: string, rating: 0 | 1 | 2 | 3 | 4 | 5): Promise<Profile>
    setNotes(name: string, notes: string): Promise<Profile>
    addRemoveTime(name: string, deltaSeconds: number, note?: string): Promise<Profile>
    resetTime(name: string): Promise<Profile>
    setIcon(name: string): Promise<Profile | null>
    setBackground(name: string, kind: 'image' | 'color', value: string): Promise<Profile | null>
    clearBackground(name: string): Promise<Profile>
    select(name: string | null): Promise<void>
  }
  timer: {
    start(name: string): Promise<void>
    pause(name: string): Promise<void>
    onTick(cb: (payload: TimerTickPayload) => void): () => void
  }
  settings: {
    get(): Promise<Settings>
    update(patch: Partial<Settings>): Promise<Settings>
  }
  importExport: {
    exportProfile(name: string): Promise<{ path: string } | null>
    importProfile(): Promise<Profile | null>
  }
  legacyImport: {
    /** force=true always re-scans (Settings' manual "Import v1 library" action); otherwise skips if a first-run decision was already made. */
    detect(force?: boolean): Promise<LegacyDetectResult>
    run(path: string): Promise<{ importedCount: number }>
    skip(): Promise<void>
    /** Native file picker for "Choose a different file…" when auto-detect misses. */
    browseForFile(): Promise<string | null>
  }
  system: {
    setRunAtStartup(enabled: boolean): Promise<void>
    setTrayEnabled(enabled: boolean): Promise<void>
    quit(): Promise<void>
  }
  window: {
    minimize(): void
    maximizeToggle(): void
    close(): void
    onMaximizeChange(cb: (isMaximized: boolean) => void): () => void
  }
  app: {
    getVersion(): Promise<string>
    getInitialData(): Promise<AppData>
  }
  updater: {
    checkNow(): Promise<{ checked: boolean }>
    downloadUpdate(): Promise<void>
    quitAndInstall(): void
    onUpdateAvailable(cb: (info: UpdateInfo) => void): () => void
    onDownloadProgress(cb: (progress: UpdateProgress) => void): () => void
    onUpdateDownloaded(cb: () => void): () => void
  }
  fonts: {
    /** Curated fonts merged with every font installed on this PC (incl. third-party), deduped and sorted. */
    list(): Promise<string[]>
  }
}

export type { GtProfileFile }
