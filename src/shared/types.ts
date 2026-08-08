import type { SessionAggregate, SessionEntry } from './sessionStats'

export type Status = 'in_progress' | 'completed' | 'dropped' | 'on_hold'

export type SortMode =
  | 'name'
  | 'name_desc'
  | 'last_played'
  | 'playtime'
  | 'favorite'
  | 'rating'
  | 'genre'

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
  /**
   * How the Library browses its games. Grid is the default because cover art is
   * how most people recognise a game faster than its name, and it is the view
   * that makes the collection feel like a collection.
   */
  libraryView: 'grid' | 'list'
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
  sessionStats?: SessionAggregate
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
