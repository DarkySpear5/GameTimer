import { promises as fs, existsSync } from 'fs'
import { dirname, join, extname } from 'path'
import { randomUUID } from 'crypto'
import { dataStore } from '../store/dataStore'
import { paths } from '../store/paths'
import { locateLegacyDataFile } from './legacyLocate'
import { readFirstRunState, updateFirstRunState } from './firstRun'
import { setRunAtStartup } from '../autostart/autostart'
import { saveCappedImage } from '../util/imageResize'
import { isInside, safeAssetFileName } from '../util/safePath'
import { emptyAggregate } from '@shared/sessionStats'
import { DEFAULT_CUSTOM_COLORS, THEME_ORDER, ICON_MAX_DIMENSION, BACKGROUND_MAX_DIMENSION } from '@shared/constants'
import type { LegacyDetectResult, Profile, Settings, Status } from '@shared/types'

const VALID_STATUSES: Status[] = ['not_started', 'in_progress', 'completed', 'dropped', 'on_hold']

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
    Array.isArray(raw.genres) && raw.genres.length ? raw.genres : raw.genre ? [raw.genre] : []

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
    rating,
    // v1 never recorded sessions, so an imported library starts with an
    // empty log — its `seconds` total is real, its session count starts at 0.
    sessionStats: emptyAggregate(),
    sessionLog: [],
    activeSession: null,
    // v1 had no concept of the game's executable either; these are filled in
    // if the user later links the game through the Add Game picker.
    exePath: null,
    steamAppId: null,
    launchUri: null,
    installDir: null,
    autoFetchArt: null,
    launches: 0,
    openSeconds: 0,
    autoStartTimer: null,
    genresFromDetection: false,
    favorite: false,
    coverFile: null
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
    language: (raw?.language as string) ?? 'en',
    autoFetchArt: true, // v1 has no equivalent concept — default on, same as a fresh install
    watchForGames: false,
    autoStartTimer: false,
    dataTableScale: 1.15,
    libraryView: 'grid',
    detailLevel: 'simple',
    extraGameFolders: [],
    launcherFolders: {},
    steamGridDbApiKey: ''
  }
}

/**
 * Copies an asset in, renaming on collision as defense-in-depth (uuid-based v1
 * filenames make collisions vanishingly unlikely).
 *
 * `rawName` comes out of the imported v1 JSON and is therefore untrusted. It
 * used to be used verbatim for both the file read and the file written, so a
 * crafted data file could read any file the user could read and write any file
 * the user could write. It is now reduced to a bare filename with a safe
 * extension, and both resulting paths are checked to be inside the directories
 * they belong to.
 */
async function copyAssetIfExists(
  sourceDir: string,
  destDir: string,
  rawName: string,
  maxDimension: number
): Promise<string | null> {
  const safeName = safeAssetFileName(rawName)
  if (!safeName) return null

  const sourcePath = join(sourceDir, safeName)
  if (!isInside(sourceDir, sourcePath) || !existsSync(sourcePath)) return null

  await fs.mkdir(destDir, { recursive: true })
  let fileName = safeName
  if (existsSync(join(destDir, fileName))) {
    fileName = `${randomUUID()}${extname(safeName)}`
  }
  const destPath = join(destDir, fileName)
  if (!isInside(destDir, destPath)) return null

  await saveCappedImage(sourcePath, destPath, maxDimension)
  return fileName
}

async function readLegacyData(dataFilePath: string): Promise<LegacyDataRaw> {
  return JSON.parse(await fs.readFile(dataFilePath, 'utf-8'))
}

export async function detectLegacyLibrary(force: boolean): Promise<LegacyDetectResult> {
  if (!force) {
    // Tests its OWN field, not merely whether firstrun.json exists. The file is
    // now written by two separate first-run flows, and the installed-games scan
    // can legitimately write it first — under the old "any state at all means
    // we already asked" check that would have silently skipped the v1 import
    // offer, so someone upgrading from v1 would never be shown their old
    // library and would reasonably conclude their data was gone.
    const firstRun = await readFirstRunState()
    if (firstRun?.legacyImportState) return { found: false }
  }

  const path = await locateLegacyDataFile()
  if (!path) {
    if (!force) await updateFirstRunState({ legacyImportState: 'none-found' })
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
  await updateFirstRunState({ legacyImportState: 'skipped' })
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
        join(legacyDir, 'icons'),
        paths.iconsDir(),
        profile.iconFile,
        ICON_MAX_DIMENSION
      )
    }
    if (profile.bgImage) {
      profile.bgImage = await copyAssetIfExists(
        join(legacyDir, 'backgrounds'),
        paths.backgroundsDir(),
        profile.bgImage,
        BACKGROUND_MAX_DIMENSION
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
  await updateFirstRunState({ legacyImportState: 'imported', importedFromPath: legacyDataFilePath })
  return { importedCount }
}
