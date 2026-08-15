import type { ActiveSession, SessionAggregate, SessionEntry } from './sessionStats'
import type { Note } from './notes'

export type Status = 'not_started' | 'in_progress' | 'completed' | 'dropped' | 'on_hold'

export type SortMode =
  | 'name'
  | 'name_desc'
  | 'last_played'
  | 'playtime'
  | 'favorite'
  | 'rating'
  | 'genre'
  | 'platform'

export type ThemeName = 'Midnight Blue' | 'Paper White' | 'Slate Grey' | 'Rose' | 'Retro Terminal' | 'Custom'

export interface ThemeColors {
  bg: string
  panel: string
  card: string
  text: string
  subtext: string
  accent: string
}

export type OverlayCorner = 'top-left' | 'top-right' | 'top-center' | 'bottom-left' | 'bottom-right' | 'bottom-center'

export interface SubCategory {
  id: string
  name: string
  /** This bucket's own running total — separate from, and always ≤, profile.seconds. */
  seconds: number
}

export interface Profile {
  name: string
  seconds: number
  iconFile: string | null
  bgColor: string | null
  bgImage: string | null
  status: Status
  statusAt: string | null
  statusSeconds: number | null
  genres: string[]
  lastPlayed: number | null
  startedDate: string | null
  /** L1: superseded by noteList, kept only as the pre-L1 export/import shape and migration source — see migrateLegacyNotes. */
  notes: string
  noteList: Note[]
  rating: 0 | 1 | 2 | 3 | 4 | 5
  /**
   * Running totals over every session ever played. This — not sessionLog — is
   * what every displayed figure is derived from, so the numbers stay exact for
   * the lifetime of the game while the log stays bounded.
   */
  sessionStats: SessionAggregate
  /**
   * The most recent sessions only (MAX_SESSION_LOG). Retained for a future
   * play-history graph; nothing shown today reads it. Absent in v2 save files —
   * the schema defaults it to [].
   */
  sessionLog: SessionEntry[]
  /**
   * Set while a timer is running, cleared on pause. A non-null value at
   * startup means the previous run ended without pausing — see recoverSessions.
   */
  activeSession: ActiveSession | null
  /** Full path of the .exe this game was detected from, or null if added manually. */
  exePath: string | null
  /** Resolved once, then cached — used for art and for launching via steam://rungameid. */
  steamAppId: number | null
  /**
   * The folder this game is installed in.
   *
   * Watched INSTEAD of a single executable, because one game is rarely one
   * process: Rocket League starts a launcher that hands off to the real binary
   * and then exits, Stardew Valley runs through SMAPI, and Steam games have no
   * exe recorded at all. Matching one exact path meant the timer paused the
   * moment a launcher handed over and never resumed.
   */
  installDir: string | null
  /**
   * The launcher's own URI for starting this game (nxl://, battlenet://, …).
   * Preferred over exePath: a Nexon game run straight from its .exe never gets
   * through the launcher's authentication.
   */
  launchUri: string | null
  /** null = follow the global setting. Explicit true/false overrides it for this game only. */
  autoFetchArt: boolean | null
  /**
   * Times the game's process actually started. Deliberately a different number
   * from the session count: a launch you never pressed Play for is a launch
   * with no session, and the gap between the two is the interesting part.
   */
  launches: number
  /**
   * Total seconds the game process was open. Only known for launches Gamut saw
   * — it is NOT playtime and must never be presented as such. See the "Played
   * vs Game was open" rule in the design spec.
   */
  openSeconds: number
  /**
   * `seconds` at the moment `openSeconds` first started accruing, or null
   * before that's ever happened. Idle time is `openSeconds` minus how much
   * `seconds` has grown SINCE this snapshot — not minus `seconds` itself.
   * `openSeconds` only ever covers launches Gamut actually watched, which for
   * almost every profile starts well after `seconds` already had real history
   * behind it (a different Gamut version, or simply before watching was ever
   * turned on) — comparing the two totals directly makes `openSeconds` look
   * permanently dwarfed by `seconds`, clamping idle to 0 for as long as it
   * takes `openSeconds` alone to overtake a number it was never supposed to
   * be measured against. Reported live: a profile with 14+ hours of
   * pre-tracking history showed exactly 0% idle no matter how long the game
   * sat open unattended. Reset to null alongside `openSeconds` (resetTime,
   * duplicate) so the next accrual re-baselines cleanly.
   */
  secondsAtOpenTrackingStart: number | null
  /** null = follow the global setting. */
  autoStartTimer: boolean | null
  /**
   * True when the genres were filled in from Steam/GOG rather than chosen by
   * the user. The genre picker locks in that case so a fetched set is not
   * edited by accident — there is an explicit Unlock, because Steam's genres
   * are coarse (it reports DOOM Eternal as simply "Action") and being stuck
   * with them would be worse than the accident.
   */
  genresFromDetection: boolean
  /**
   * Starred by the user. Purely their own marker — nothing detects or infers
   * it — which is why it survives every automatic update to a game and is the
   * one ordering that can't be derived from the other fields.
   */
  favorite: boolean
  /**
   * Portrait box art for the Library grid. Separate from iconFile because they
   * are different shapes doing different jobs: iconFile is the square community
   * icon that reads correctly at 36px in a list, and a portrait poster cropped
   * square reads as a random slice of itself. Null is normal and handled —
   * Steam's asset coverage is uneven and a manually added game has none.
   */
  coverFile: string | null
  /** L (2026-08-14): optional time-tracking breakdown for this game. Empty for every game not using the feature. */
  subCategories: SubCategory[]
  /** null = follow the global setting. Explicit true/false overrides it for this game only. */
  subCategoriesEnabled: boolean | null
}

export interface Settings {
  trayEnabled: boolean
  runAtStartup: boolean
  checkForUpdates: boolean
  iconSize: number
  theme: ThemeName
  customColors: ThemeColors
  fontFamily: string
  fontScale: number
  sortMode: SortMode
  genreFilter: string
  statusFilter: 'All' | Status
  language: string
  /** Default for games whose own autoFetchArt is null. */
  autoFetchArt: boolean
  /** Zoom multiplier for the Data tab only — its table is dense and reads small at 1x. */
  dataTableScale: number
  /**
   * Poll for known game executables in the background. Off by default — it is
   * the only thing here with an ongoing cost, and launching from Gamut gives
   * exact counts without it.
   */
  watchForGames: boolean
  /**
   * Start the timer by itself when a game launches. Off by default, and that
   * default is a product decision, not caution: auto-tracking measures "the
   * process was open", which is how Steam turns a 19-hour playthrough into 50.
   */
  autoStartTimer: boolean
  /** Default for games whose own subCategoriesEnabled is null. */
  subCategoriesEnabled: boolean
  /**
   * How the Library browses its games. Grid is the default because cover art is
   * how most people recognise a game faster than its name, and it is the view
   * that makes the collection feel like a collection.
   */
  libraryView: 'grid' | 'list'
  /**
   * How much detail the Stats table and the More Info window show. One switch
   * governs both, so "show me more" is a single idea rather than a per-screen
   * preference the user has to find twice.
   *
   * Simple is the default: the figures it hides are the ones that need context
   * to read correctly (open time, idle share, launch counts), and someone
   * meeting the app for the first time should not have to interpret them.
   */
  detailLevel: 'simple' | 'advanced'
  /**
   * Extra folders the installed-games scan looks in, each treated as a parent
   * of one-folder-per-game. Covers a launcher installed on another drive and
   * games that belong to no launcher at all.
   */
  extraGameFolders: string[]
  /**
   * Per-launcher install folder override, keyed by GameSource. Scanned in
   * addition to the automatic detection, so setting one never turns the
   * working detection off.
   */
  launcherFolders: Partial<Record<GameSource, string>>
  /**
   * The user's own SteamGridDB API key, for fetching art for non-Steam games.
   * Empty means the feature is off — every other art source is keyless.
   */
  steamGridDbApiKey: string
  /** M: rebindable global hotkeys. Combo strings are validateCombo's display shape, e.g. "Ctrl+2". */
  keybinds: {
    startPauseTimer: string
    saveScreenshot: string
    toggleOverlay: string
  }
  /** O: the in-game overlay's visibility, position, size, and text-shadow. */
  overlay: {
    enabled: boolean
    corner: OverlayCorner
    scale: number
    shadow: boolean
  }
}

/** One running application offered in the Add Game picker. */
export interface DetectedApp {
  pid: number
  processName: string
  title: string
  exePath: string
  /** data: URL of the exe's own icon, or null if Windows wouldn't give one up. */
  iconDataUrl: string | null
  /** Sits under a known game-library root — these sort first in the picker. */
  likelyGame: boolean
}

/** Where an installed game was found. `folder` is a directory the user pointed at. */
export type GameSource = 'steam' | 'epic' | 'gog' | 'xbox' | 'battlenet' | 'ea' | 'nexon' | 'folder'

/** One game found on this PC by a launcher scan, before the user confirms it. */
export interface FoundGame {
  /** Unique across a scan — `<source>:<launcher's own id>`. */
  id: string
  name: string
  source: GameSource
  /** Null when the source records a name but no install (see the Nexon note in installedSources.ts). */
  exePath: string | null
  /** The game's install folder, which is what the watcher polls. */
  installDir: string | null
  steamAppId: number | null
  /**
   * How the launcher itself starts this game, e.g. nxl://launch/10300. Preferred
   * over the raw executable wherever it exists — some games authenticate through
   * their launcher and simply fail when their .exe is run directly.
   */
  launchUri: string | null
  /**
   * False when the evidence is a name rather than an install. Those are still
   * offered — they are real games the user plays — but not pre-ticked, because
   * the source cannot say whether the game is still installed.
   */
  confident: boolean
}

/** A FoundGame as offered in the picker, once checked against the library. */
export interface InstalledGame extends FoundGame {
  /** Already in the library — shown, but pre-unticked and labelled. */
  alreadyAdded: boolean
}

export interface GameSearchHit {
  appId: number
  name: string
  /** Square community icon. The only genuinely square art Steam exposes — store assets are all wide or tall. */
  iconUrl?: string
}

/** One candidate image the user can pick for a game. */
export interface ArtOption {
  /** Full-size image, downloaded only if chosen. */
  url: string
  /** Smaller version for the picker grid — often the same URL. */
  thumb: string
}

export interface ArtOptions {
  icons: ArtOption[]
  backgrounds: ArtOption[]
}

export interface GameIdentity {
  name: string
  steamAppId: number | null
  /**
   * True only when resolved from a Steam appmanifest, which is exact. False
   * means it came from a fuzzy name search and must be confirmed before use —
   * that search returns wrong-but-plausible results (e.g. a game's Playtest
   * entry instead of the game).
   */
  confident: boolean
  suggestions: GameSearchHit[]
}

export interface UpdateInfo {
  version: string
  releaseNotes?: string | null
}

export interface UpdateProgress {
  percent: number
}

export interface AppData {
  profiles: Record<string, Profile>
  lastSelected: string | null
  settings: Settings
}

export interface GtProfileFile {
  name: string
  seconds: number
  status: Status
  statusAt: string | null
  statusSeconds: number | null
  genres: string[]
  lastPlayed: number | null
  startedDate: string | null
  notes: string
  rating: number
  /**
   * Optional so the format stays readable by v1 and v2, which simply ignore
   * it. Present so exporting from a newer build and importing into an older
   * one — or into a fresh install — carries session history instead of
   * silently resetting the count to zero while keeping the playtime.
   */
  sessionLog?: SessionEntry[]
  sessionStats?: SessionAggregate
  /** Optional for the same reason as sessionLog — absent from any export written before L1, and simply ignored by any build older than it. */
  noteList?: Note[]
  steamAppId?: number | null
  iconB64?: string
  iconExt?: string
  bgImageB64?: string
  bgImageExt?: string
  bgColor?: string
}

export interface LegacyDetectResult {
  found: boolean
  path?: string
  profileCount?: number
  totalSeconds?: number
}
