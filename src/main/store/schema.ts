import { z } from 'zod'
import { DEFAULT_CUSTOM_COLORS } from '@shared/constants'
import type { AppData } from '@shared/types'

/**
 * Every field uses .catch() rather than plain validation — this mirrors v1's
 * load_data(), which never rejects a file for being partial/stale, it just
 * setdefault()s whatever's missing. A field that's the wrong type or absent
 * silently falls back to its default instead of failing the whole load.
 */
const StatusSchema = z
  .enum(['not_started', 'in_progress', 'completed', 'dropped', 'on_hold'])
  .catch('in_progress')

const ThemeColorsSchema = z
  .object({
    bg: z.string(),
    panel: z.string(),
    card: z.string(),
    text: z.string(),
    subtext: z.string(),
    accent: z.string()
  })
  .catch(DEFAULT_CUSTOM_COLORS)

const RatingSchema = z
  .union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
  .catch(0)

const SessionEntrySchema = z.object({
  startedAt: z.number().catch(0),
  seconds: z.number().catch(0),
  short: z.literal(true).optional()
})

const SessionAggregateSchema = z
  .object({
    count: z.number().catch(0),
    totalSeconds: z.number().catch(0),
    longestSeconds: z.number().catch(0),
    firstPlayedAt: z.number().nullable().catch(null),
    lastPlayedAt: z.number().nullable().catch(null)
  })
  .catch({ count: 0, totalSeconds: 0, longestSeconds: 0, firstPlayedAt: null, lastPlayedAt: null })

const ProfileSchema = z
  .object({
    name: z.string().catch(''),
    seconds: z.number().catch(0),
    iconFile: z.string().nullable().catch(null),
    bgColor: z.string().nullable().catch(null),
    bgImage: z.string().nullable().catch(null),
    status: StatusSchema,
    statusAt: z.string().nullable().catch(null),
    statusSeconds: z.number().nullable().catch(null),
    genres: z.array(z.string()).catch([]),
    lastPlayed: z.number().nullable().catch(null),
    startedDate: z.string().nullable().catch(null),
    notes: z.string().catch(''),
    rating: RatingSchema,
    // .catch([]) rather than validation: same contract as every other field
    // here — a partial or corrupt file loses the bad field, never the library.
    sessionStats: SessionAggregateSchema,
    sessionLog: z.array(SessionEntrySchema).catch([]),
    // Absent in every save written before crash recovery existed, so it
    // defaults to null rather than being required.
    activeSession: z
      .object({ startedAt: z.number(), lastSeenAt: z.number() })
      .nullable()
      .catch(null)
      .default(null),
    exePath: z.string().nullable().catch(null),
    steamAppId: z.number().nullable().catch(null),
    // Tri-state on purpose: null means "follow the global setting", so
    // flipping the cogwheel moves every game the user hasn't overridden.
    autoFetchArt: z.boolean().nullable().catch(null),
    launches: z.number().catch(0),
    openSeconds: z.number().catch(0),
    autoStartTimer: z.boolean().nullable().catch(null),
    genresFromDetection: z.boolean().catch(false),
    favorite: z.boolean().catch(false),
    coverFile: z.string().nullable().catch(null),
    launchUri: z.string().nullable().catch(null),
    installDir: z.string().nullable().catch(null)
  })

const ThemeNameSchema = z
  .enum(['Midnight Blue', 'Paper White', 'Slate Grey', 'Rose', 'Retro Terminal', 'Custom'])
  .catch('Midnight Blue')

const SettingsSchema = z.object({
  trayEnabled: z.boolean().catch(true),
  runAtStartup: z.boolean().catch(false),
  checkForUpdates: z.boolean().catch(true),
  iconSize: z.number().catch(36),
  theme: ThemeNameSchema,
  customColors: ThemeColorsSchema,
  fontFamily: z.string().catch('Segoe UI'),
  fontScale: z.number().catch(1.0),
  // Widened in v3, and .catch('name') is what makes that safe in both
  // directions: a file written by a newer build and opened by an older one
  // falls back to Name rather than refusing to load. Same contract as every
  // other field — a save file never loses more than the field it got wrong.
  sortMode: z
    .enum([
      'name',
      'name_desc',
      'last_played',
      'playtime',
      'favorite',
      'rating',
      'genre',
      'platform'
    ])
    .catch('name'),
  genreFilter: z.string().catch('All'),
  statusFilter: z
    .union([z.literal('All'), z.enum(['not_started', 'in_progress', 'completed', 'dropped', 'on_hold'])])
    .catch('All'),
  language: z.string().catch('en'),
  autoFetchArt: z.boolean().catch(true),
  dataTableScale: z.number().catch(1.15),
  watchForGames: z.boolean().catch(false),
  autoStartTimer: z.boolean().catch(false),
  libraryView: z.enum(['grid', 'list']).catch('grid'),
  // Simple by default so a first-time user gets the uncluttered version
  // without having to discover a setting to get it.
  detailLevel: z.enum(['simple', 'advanced']).catch('simple'),
  // Folders the user pointed at for the installed-games scan — for games kept
  // outside a launcher's default location, or outside a launcher entirely.
  extraGameFolders: z.array(z.string()).catch([]),
  // Per-launcher install folder, for a launcher whose games live somewhere the
  // automatic detection doesn't look. Scanned IN ADDITION to it, never instead.
  launcherFolders: z.record(z.string(), z.string()).catch({}),
  // The user's OWN SteamGridDB key. Empty = the feature is simply off. See the
  // exception note at the top of art/steamGridDb.ts.
  steamGridDbApiKey: z.string().catch('')
})

const AppDataSchema = z.object({
  profiles: z.record(z.string(), ProfileSchema).catch({}),
  lastSelected: z.string().nullable().catch(null),
  settings: SettingsSchema.catch(SettingsSchema.parse({}))
})

function withKeysAsNames(data: z.infer<typeof AppDataSchema>): AppData {
  const profiles: AppData['profiles'] = {}
  for (const [key, profile] of Object.entries(data.profiles)) {
    profiles[key] = { ...profile, name: key }
  }
  return { ...data, profiles }
}

export function freshAppData(): AppData {
  return withKeysAsNames(AppDataSchema.parse({}))
}

/** Throws if `raw` isn't even an object — callers should catch and fall back to freshAppData(). */
export function parseAppData(raw: unknown): AppData {
  return withKeysAsNames(AppDataSchema.parse(raw))
}
