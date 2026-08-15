import type {
  AppData,
  ArtOptions,
  DetectedApp,
  GameSource,
  InstalledGame,
  GameIdentity,
  GameSearchHit,
  GtProfileFile,
  LegacyDetectResult,
  Profile,
  Settings,
  Status,
  UpdateInfo,
  UpdateProgress
} from './types'
import type { DrawingStroke } from './notes'

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
    refreshArt: 'profiles:refreshArt',
    setAutoFetchArt: 'profiles:setAutoFetchArt',
    setGenres: 'profiles:setGenres',
    setRating: 'profiles:setRating',
    setFavorite: 'profiles:setFavorite',
    createSubCategory: 'profiles:createSubCategory',
    renameSubCategory: 'profiles:renameSubCategory',
    deleteSubCategory: 'profiles:deleteSubCategory',
    setSubCategoriesEnabled: 'profiles:setSubCategoriesEnabled',
    assignSubCategorySession: 'profiles:assignSubCategorySession',
    createNote: 'profiles:createNote',
    renameNote: 'profiles:renameNote',
    deleteNote: 'profiles:deleteNote',
    updateNoteBody: 'profiles:updateNoteBody',
    updateNoteDrawing: 'profiles:updateNoteDrawing',
    addRemoveTime: 'profiles:addRemoveTime',
    resetTime: 'profiles:resetTime',
    setIcon: 'profiles:setIcon',
    setBackground: 'profiles:setBackground',
    clearBackground: 'profiles:clearBackground',
    select: 'profiles:select',
    changed: 'profiles:changed'
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
  notes: {
    openPopout: 'notes:openPopout',
    getPopoutState: 'notes:getPopoutState',
    moveDrawing: 'notes:moveDrawing',
    setViewedNote: 'notes:setViewedNote',
    setDropZone: 'notes:setDropZone',
    closePopoutWithFade: 'notes:closePopoutWithFade',
    popoutState: 'notes:popoutState',
    dropDetected: 'notes:dropDetected',
    dropZoneHover: 'notes:dropZoneHover'
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
  },
  keybinds: {
    set: 'keybinds:set'
  },
  screenshots: {
    list: 'screenshots:list',
    open: 'screenshots:open'
  },
  overlay: {
    tick: 'overlay:tick'
  },
  toast: {
    show: 'toast:show'
  },
  dev: {
    triggerKeybind: 'dev:triggerKeybind'
  },
  detect: {
    listRunning: 'detect:listRunning',
    identify: 'detect:identify',
    search: 'detect:search',
    createGame: 'detect:createGame',
    launch: 'detect:launch',
    stop: 'detect:stop',
    openExeDirectory: 'detect:openExeDirectory',
    openGames: 'detect:openGames',
    openGamesChanged: 'detect:openGamesChanged',
    setAutoStartTimer: 'detect:setAutoStartTimer',
    classify: 'detect:classify',
    artOptions: 'detect:artOptions',
    setArtFromUrl: 'detect:setArtFromUrl',
    listInstalled: 'detect:listInstalled',
    importInstalled: 'detect:importInstalled',
    installedScanPending: 'detect:installedScanPending',
    skipInstalledScan: 'detect:skipInstalledScan',
    addGameFolder: 'detect:addGameFolder',
    removeGameFolder: 'detect:removeGameFolder',
    listGameFolders: 'detect:listGameFolders',
    setLauncherFolder: 'detect:setLauncherFolder',
    listLauncherFolders: 'detect:listLauncherFolders',
    link: 'detect:link',
    unlink: 'detect:unlink'
  }
} as const

export interface TimerTickPayload {
  running: Record<string, number>
  /**
   * name -> the sub-category currently assigned for this running session
   * (see timerEngine's activeCategoryAssignment) and its own live-interpolated
   * total — the same "stored value + elapsed since last checkpoint" math as
   * `running`, so a category's displayed time ticks every UI_TICK_MS exactly
   * like the main total does, instead of only refreshing on pause.
   */
  runningCategories: Record<string, { categoryId: string; seconds: number }>
}

export interface OverlayTickPayload {
  seconds: number
  running: boolean
  scale: number
  shadow: boolean
}

/** Which note's drawing is currently open in the L3 pop-out window, or null if none is. */
export interface PopoutState {
  name: string
  noteId: string
}

export type KeybindKind = 'startPauseTimer' | 'saveScreenshot' | 'toggleOverlay'

/** Toasts triggered from main (no renderer call site to react to a result — e.g. the global screenshot hotkey) arrive as a code + params, not pre-translated text; main has no i18n instance. */
export interface ToastBroadcastPayload {
  code: string
  kind: 'info' | 'error'
  params?: Record<string, string>
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
    /** overrideSeconds: statusSeconds to use instead of profile.seconds — see CompleteTimerDialog. */
    setStatus(name: string, status: Status, overrideSeconds?: number): Promise<Profile>
    /** Irreversibly clears the completion/dropped snapshot. Confirm with the user before calling. */
    clearStatusRecord(name: string): Promise<Profile>
    /** Re-downloads cover and background for a game that already knows its appid. */
    refreshArt(name: string): Promise<Profile>
    /** null = follow the global setting. */
    setAutoFetchArt(name: string, value: boolean | null): Promise<Profile>
    setGenres(name: string, genres: string[]): Promise<Profile>
    setRating(name: string, rating: 0 | 1 | 2 | 3 | 4 | 5): Promise<Profile>
    setFavorite(name: string, favorite: boolean): Promise<Profile>
    /** categoryName omitted = a default placeholder, renamed inline afterward — see profileService.createSubCategory. */
    createSubCategory(name: string, categoryName?: string): Promise<Profile>
    renameSubCategory(name: string, categoryId: string, newName: string): Promise<Profile>
    deleteSubCategory(name: string, categoryId: string): Promise<Profile>
    /** null = follow the global setting; true/false override it for this game. Never deletes existing sub-category data. */
    setSubCategoriesEnabled(name: string, value: boolean | null): Promise<Profile>
    assignSubCategorySession(name: string, categoryId: string): Promise<Profile>
    /** L1: a fresh untitled note at the top of the list. */
    createNote(name: string): Promise<Profile>
    renameNote(name: string, noteId: string, title: string): Promise<Profile>
    deleteNote(name: string, noteId: string): Promise<Profile>
    updateNoteBody(name: string, noteId: string, body: string): Promise<Profile>
    updateNoteDrawing(name: string, noteId: string, drawing: DrawingStroke[]): Promise<Profile>
    addRemoveTime(name: string, deltaSeconds: number): Promise<Profile>
    resetTime(name: string): Promise<Profile>
    setIcon(name: string): Promise<Profile | null>
    setBackground(name: string, kind: 'image' | 'color', value: string): Promise<Profile | null>
    clearBackground(name: string): Promise<Profile>
    select(name: string | null): Promise<void>
    /**
     * Pushed whenever the MAIN process mutates a profile on its own —
     * gameWatcher's background poll (auto-pause, launch/openSeconds accrual)
     * — since that's the only kind of profile change with no natural request/
     * response round-trip a renderer-initiated action already refreshes
     * itself with. Every other profiles.* method already returns the updated
     * Profile directly to whoever called it.
     */
    onChanged(cb: (profiles: Profile[]) => void): () => void
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
  /**
   * L3: the drawing pop-out. Only one can be open at a time — see
   * drawingPopout.ts. openPopout resolves false if a DIFFERENT note is
   * already popped out; the caller is expected to have hidden/disabled the
   * button in that case (see NoteEditor's own popoutState subscription)
   * rather than needing to handle it as a surprise.
   */
  notes: {
    openPopout(name: string, noteId: string): Promise<{ opened: boolean }>
    getPopoutState(): Promise<PopoutState | null>
    /** The two games can differ — dragging onto a DIFFERENT game's note editor is a valid target. The caller must confirm an overwrite with the user before calling this — it performs the move unconditionally. */
    moveDrawing(
      fromName: string,
      fromNoteId: string,
      toName: string,
      toNoteId: string
    ): Promise<{ from: Profile; to: Profile }>
    /** Which note (if any) the main window's NoteEditor currently has open — lets a drag-drop reattach pick a different note as the target, instead of always reattaching to the pop-out's own. Pass null when leaving the editor. */
    setViewedNote(target: { name: string; noteId: string } | null): void
    /**
     * The screen-space-relative rect of NoteEditor's drawing zone (the live
     * canvas, or its placeholder when popped out) — main compares the
     * pop-out's dragged position against this specific rect, not the whole
     * app window, and adds the main window's own current on-screen position
     * at comparison time. Coordinates are relative to the main window's
     * content area (plain getBoundingClientRect() output), NOT absolute
     * screen coordinates — that conversion only main can do, and only main
     * knows where its own window currently sits. Pass null when the zone
     * leaves the DOM (Back, note deleted, dialog closed).
     */
    setDropZone(rect: { x: number; y: number; width: number; height: number } | null): void
    /** Fades the pop-out's opacity out, then closes it — the "merged into the note" animation for a successful drag-drop. Plain window.close() stays the escape hatch (✕ / Escape) precisely because it must NOT depend on this extra step. */
    closePopoutWithFade(): void
    onPopoutStateChanged(cb: (state: PopoutState | null) => void): () => void
    /**
     * Fired at the pop-out window ONLY, when main detects it's been dropped
     * on the app after a drag. main decides WHETHER a drop happened and
     * WHICH note (and which GAME — the main window can be showing a note of
     * a totally different game from the one popped out) it landed on; the
     * pop-out's own renderer decides what to do about it (confirm an
     * overwrite, call moveDrawing, close itself) — reusing the exact same
     * code path the "Move to note" dropdown already uses, so both ways of
     * moving a drawing behave identically and a confirm can be
     * driven/verified as an ordinary web dialog.
     */
    onDropDetected(cb: (target: { name: string; noteId: string }) => void): () => void
    /** Fired at the MAIN window only, while a pop-out is being dragged over the drop zone — drives the hover highlight so the target is discoverable and gives feedback before release. */
    onDropZoneHover(cb: (hovering: boolean) => void): () => void
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
  keybinds: {
    /** Validates, registers (replacing any previous registration for this kind), and persists in one atomic call — see keybindService.ts. */
    set(
      kind: KeybindKind,
      combo: string
    ): Promise<{ ok: true; settings: Settings } | { ok: false; error: 'invalid_combo' | 'register_failed' }>
  }
  screenshots: {
    /** Newest-first absolute file paths. */
    list(name: string): Promise<string[]>
    open(filePath: string): Promise<void>
  }
  overlay: {
    onTick(cb: (payload: OverlayTickPayload) => void): () => void
  }
  toast: {
    onBroadcast(cb: (payload: ToastBroadcastPayload) => void): () => void
  }
  detect: {
    /** Running applications with a visible window, likely games first. Read-only. */
    listRunning(): Promise<DetectedApp[]>
    /** Resolves an executable to a game. Check `confident` before applying the result. */
    identify(exePath: string, windowTitle: string): Promise<GameIdentity>
    /** Keyless fuzzy search of Steam's catalogue, for correcting a wrong guess. */
    search(query: string): Promise<GameSearchHit[]>
    /** Creates the profile, links the exe/appid, and fetches art if enabled. */
    createGame(name: string, exePath: string | null, steamAppId: number | null): Promise<Profile>
    /** Starts the game via steam://rungameid when an appid is known, else its .exe. Counts the launch. */
    launch(name: string): Promise<{ launched: boolean }>
    /** Kills every process belonging to this game (same folder/exe match the watcher uses). */
    stop(name: string): Promise<{ stopped: boolean }>
    /** Opens Explorer at the game's .exe (selected) or its install folder. False if neither is known or the path no longer exists. */
    openExeDirectory(name: string): Promise<{ opened: boolean }>
    /** Names of every game whose process is currently seen running. */
    openGames(): Promise<string[]>
    /** Fires whenever a game's process opens or closes. */
    onOpenGamesChanged(cb: (names: string[]) => void): () => void
    /** null = follow the global setting. */
    setAutoStartTimer(name: string, value: boolean | null): Promise<Profile>
    /** Which of these executables Steam's catalogue confirms are games. Promotion only — a 'no' never hides anything. */
    classify(exePaths: string[]): Promise<string[]>
    /** Every candidate icon/background for a game. URLs only — nothing is downloaded until one is chosen. */
    artOptions(name: string, steamAppId: number | null): Promise<ArtOptions>
    /** Downloads the chosen image and makes it this game's icon or background. */
    setArtFromUrl(name: string, kind: 'icon' | 'background', url: string): Promise<Profile>
    /** Attaches an .exe to an existing game so it can be detected and launched. */
    link(name: string, exePath: string, steamAppId: number | null): Promise<Profile>
    unlink(name: string): Promise<Profile>
    /** Every game installed through Steam, each flagged with whether the library already has it. Read-only. */
    listInstalled(): Promise<InstalledGame[]>
    /** Creates a profile per chosen id, at zero playtime. Already-present games are skipped. */
    importInstalled(ids: string[]): Promise<{ importedCount: number }>
    /** Opens a directory chooser and remembers the folder. Returns it, or null if cancelled. */
    addGameFolder(): Promise<string | null>
    removeGameFolder(folder: string): Promise<void>
    listGameFolders(): Promise<string[]>
    /** Opens a chooser for one launcher's install folder, or clears it. Returns the new map. */
    setLauncherFolder(source: GameSource, clear?: boolean): Promise<Partial<Record<GameSource, string>>>
    listLauncherFolders(): Promise<Partial<Record<GameSource, string>>>
    /** Whether the one-time "add your installed games" offer still needs to be made. */
    installedScanPending(): Promise<boolean>
    /** Records that the offer was declined, so it is not made again. */
    skipInstalledScan(): Promise<void>
  }
}

export type { GtProfileFile }
