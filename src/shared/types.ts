import type { SessionEntry } from './sessionStats'

export type Status = 'in_progress' | 'completed' | 'dropped' | 'on_hold'

export type SortMode = 'name' | 'last_played' | 'rating' | 'genre'

export type ThemeName = 'Midnight Blue' | 'Paper White' | 'Slate Grey' | 'Rose' | 'Retro Terminal' | 'Custom'

export interface ThemeColors {
  bg: string
  panel: string
  card: string
  text: string
  subtext: string
  accent: string
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
  notes: string
  rating: 0 | 1 | 2 | 3 | 4 | 5
  /**
   * Every Play→Pause cycle, oldest first, kept forever. Counts and averages
   * are derived from this (see summarizeSessions) rather than stored, so they
   * can never drift out of sync with it. Absent in v2 save files — the schema
   * defaults it to [].
   */
  sessionLog: SessionEntry[]
  /** Full path of the .exe this game was detected from, or null if added manually. */
  exePath: string | null
  /** Resolved once, then cached — used for art and for launching via steam://rungameid. */
  steamAppId: number | null
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
