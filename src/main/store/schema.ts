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
  .enum(['in_progress', 'completed', 'dropped', 'on_hold'])
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
    genres: z.array(z.string()).catch(['Uncategorized']),
    lastPlayed: z.number().nullable().catch(null),
    startedDate: z.string().nullable().catch(null),
    notes: z.string().catch(''),
    rating: RatingSchema
  })
  .transform((p) => ({ ...p, genres: p.genres.length ? p.genres : ['Uncategorized'] }))

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
  sortMode: z.enum(['name', 'last_played', 'rating', 'genre']).catch('name'),
  genreFilter: z.string().catch('All'),
  statusFilter: z
    .union([z.literal('All'), z.enum(['in_progress', 'completed', 'dropped', 'on_hold'])])
    .catch('All'),
  language: z.string().catch('en')
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
