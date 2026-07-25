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
