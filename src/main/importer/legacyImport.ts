import { promises as fs, existsSync } from 'fs'
import { dirname, join, extname } from 'path'
import { randomUUID } from 'crypto'
import { dataStore } from '../store/dataStore'
import { paths } from '../store/paths'
import { locateLegacyDataFile } from './legacyLocate'
import { readFirstRunState, writeFirstRunState } from './firstRun'
import { setRunAtStartup } from '../autostart/autostart'
import { DEFAULT_CUSTOM_COLORS, THEME_ORDER } from '@shared/constants'
import type { LegacyDetectResult, Profile, Settings, Status } from '@shared/types'

const VALID_STATUSES: Status[] = ['in_progress', 'completed', 'dropped', 'on_hold']

/**
 * v1's on-disk shape is snake_case and, even after v1's own load_data()
 * migrations run, real files still carry stale pre-v1.6 keys alongside the
 * current ones (confirmed against an actual live v1.9.1 data file: a
 * profile had `completed`/`completed_at`/`completed_seconds` sitting next to
 * a fully-populated `status`/`status_at`/`status_seconds`). This type is
 * intentionally loose — every field is optional and unknown keys are simply
 * never read, rather than assuming the file is canonical.
 */
interface LegacyProfileRaw {
  seconds?: number
  icon_file?: string | null
  bg_color?: string | null
  bg_image?: string | null
  status?: string
  status_at?: string | null
  status_seconds?: number | null
  completed?: boolean
  completed_at?: string | null
  completed_seconds?: number | null
  genres?: string[]
  genre?: string
  last_played?: number | null
  started_date?: string | null
  notes?: string
  rating?: number
}

interface LegacyDataRaw {
  profiles?: Record<string, LegacyProfileRaw>
  last_selected?: string | null
  settings?: Record<string, unknown>
}

function normalizeLegacyProfile(name: string, raw: LegacyProfileRaw): Profile {
  let status: Status = 'in_progress'
  let statusAt: string | null = null
  let statusSeconds: number | null = null

  if (raw.status && (VALID_STATUSES as string[]).includes(raw.status)) {
    status = raw.status as Status
    statusAt = raw.status_at ?? null
    statusSeconds = raw.status_seconds ?? null
  } else if (raw.completed) {
    // Pre-v1.6 boolean triplet, in case a genuinely ancient file slipped through.
    status = 'completed'
    statusAt = raw.completed_at ?? null
    statusSeconds = raw.completed_seconds ?? null
  }

  const genres =
    Array.isArray(raw.genres) && raw.genres.length
      ? raw.genres
      : raw.genre
        ? [raw.genre]
        : ['Uncategorized']

  const rating = ([0, 1, 2, 3, 4, 5] as number[]).includes(raw.rating ?? 0)
    ? ((raw.rating ?? 0) as 0 | 1 | 2 | 3 | 4 | 5)
    : 0

  return {
    name,
    seconds: typeof raw.seconds === 'number' ? raw.seconds : 0,
    iconFile: raw.icon_file ?? null,
    bgColor: raw.bg_color ?? null,
    bgImage: raw.bg_image ?? null,
    status,
    statusAt,
    statusSeconds,
    genres,
    lastPlayed: raw.last_played ?? null,
    startedDate: raw.started_date ?? null,
    notes: raw.notes ?? '',
    rating
  }
}

function normalizeLegacySettings(raw: Record<string, unknown> | undefined): Settings {
  const theme = THEME_ORDER.includes(raw?.theme as never) ? (raw!.theme as Settings['theme']) : 'Midnight Blue'
  return {
    trayEnabled: (raw?.tray_enabled as boolean) ?? true,
    runAtStartup: (raw?.run_at_startup as boolean) ?? false,
    checkForUpdates: true, // v1 has no equivalent concept — default on for a fresh v2 setting
    iconSize: (raw?.icon_size as number) ?? 36,
    theme,
    customColors: (raw?.custom_colors as Settings['customColors']) ?? DEFAULT_CUSTOM_COLORS,
    fontFamily: (raw?.font_family as string) ?? 'Segoe UI',
    fontScale: (raw?.font_scale as number) ?? 1.0,
    sortMode: (raw?.sort_mode as Settings['sortMode']) ?? 'name',
    genreFilter: (raw?.genre_filter as string) ?? 'All',
    statusFilter: (raw?.status_filter as Settings['statusFilter']) ?? 'All',
    language: (raw?.language as string) ?? 'en'
  }
}

/** Copies an asset in, renaming on collision as defense-in-depth (uuid-based v1 filenames make collisions vanishingly unlikely). */
async function copyAssetIfExists(
  sourcePath: string,
  destDir: string,
  preferredFileName: string
): Promise<string | null> {
  if (!existsSync(sourcePath)) return null
  await fs.mkdir(destDir, { recursive: true })
  let fileName = preferredFileName
  if (existsSync(join(destDir, fileName))) {
    fileName = `${randomUUID()}${extname(preferredFileName)}`
  }
  await fs.copyFile(sourcePath, join(destDir, fileName))
  return fileName
}

async function readLegacyData(dataFilePath: string): Promise<LegacyDataRaw> {
  return JSON.parse(await fs.readFile(dataFilePath, 'utf-8'))
}

export async function detectLegacyLibrary(force: boolean): Promise<LegacyDetectResult> {
  if (!force) {
    const firstRun = await readFirstRunState()
    if (firstRun) return { found: false }
  }

  const path = await locateLegacyDataFile()
  if (!path) {
    if (!force) await writeFirstRunState({ legacyImportState: 'none-found' })
    return { found: false }
  }

  try {
    const raw = await readLegacyData(path)
    const profiles = Object.values(raw.profiles ?? {})
    const totalSeconds = profiles.reduce((sum, p) => sum + (p.seconds ?? 0), 0)
    return { found: true, path, profileCount: profiles.length, totalSeconds }
  } catch {
    return { found: false }
  }
}

export async function skipLegacyImport(): Promise<void> {
  await writeFirstRunState({ legacyImportState: 'skipped' })
}

export async function runLegacyImport(legacyDataFilePath: string): Promise<{ importedCount: number }> {
  const legacyDir = dirname(legacyDataFilePath)
  const raw = await readLegacyData(legacyDataFilePath)
  const legacyProfiles = raw.profiles ?? {}

  const data = dataStore.get()
  let importedCount = 0

  for (const [name, rawProfile] of Object.entries(legacyProfiles)) {
    const profile = normalizeLegacyProfile(name, rawProfile)

    if (profile.iconFile) {
      profile.iconFile = await copyAssetIfExists(
        join(legacyDir, 'icons', profile.iconFile),
        paths.iconsDir(),
        profile.iconFile
      )
    }
    if (profile.bgImage) {
      profile.bgImage = await copyAssetIfExists(
        join(legacyDir, 'backgrounds', profile.bgImage),
        paths.backgroundsDir(),
        profile.bgImage
      )
    }

    // Defense-in-depth: v2 normally starts empty, so this shouldn't collide, but never overwrite.
    let finalName = name
    let counter = 2
    while (finalName in data.profiles) {
      finalName = `${name} (${counter})`
      counter++
    }
    profile.name = finalName
    data.profiles[finalName] = profile
    importedCount++
  }

  data.settings = normalizeLegacySettings(raw.settings)
  if (raw.last_selected && data.profiles[raw.last_selected]) {
    data.lastSelected = raw.last_selected
  }
  // Applies to v2's own exe path — Electron's setLoginItemSettings only ever
  // touches this app's own registration, never v1's, so carrying the
  // preference over is safe rather than silently dropping it to false.
  setRunAtStartup(data.settings.runAtStartup)

  await dataStore.save()
  await writeFirstRunState({ legacyImportState: 'imported', importedFromPath: legacyDataFilePath })
  return { importedCount }
}
