import { promises as fs, existsSync } from 'fs'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import { BrowserWindow, dialog } from 'electron'
import { dataStore } from '../store/dataStore'
import { paths } from '../store/paths'
import { timerEngine } from '../timer/timerEngine'
import { writeStatusLog } from '../statusLog/writeStatusLog'
import { saveCappedImageBuffer } from '../util/imageResize'
import { ICON_MAX_DIMENSION, BACKGROUND_MAX_DIMENSION } from '@shared/constants'
import { safeImageExt } from './safeExt'
import { aggregateFrom, trimSessionLog } from '@shared/sessionStats'
import type { GtProfileFile, Profile } from '@shared/types'

/** Single-game export, self-contained (images embedded as base64) — wire-compatible with v1's .gtprofile format. */
export async function exportProfile(win: BrowserWindow, name: string): Promise<{ path: string } | null> {
  timerEngine.checkpointOne(name) // reflect the live session, not a stale value
  const profile = dataStore.get().profiles[name]
  if (!profile) throw new Error(`No such profile: ${name}`)

  const exported: GtProfileFile = {
    name: profile.name,
    seconds: profile.seconds,
    status: profile.status,
    statusAt: profile.statusAt,
    statusSeconds: profile.statusSeconds,
    genres: profile.genres,
    lastPlayed: profile.lastPlayed,
    startedDate: profile.startedDate,
    notes: profile.notes,
    rating: profile.rating,
    // Carried so an export/import round trip keeps the session history. Older
    // builds ignore the extra keys; without them a re-import would keep the
    // playtime but silently reset Sessions to zero.
    sessionLog: profile.sessionLog,
    sessionStats: profile.sessionStats,
    steamAppId: profile.steamAppId
  }

  if (profile.iconFile) {
    const iconPath = join(paths.iconsDir(), profile.iconFile)
    if (existsSync(iconPath)) {
      exported.iconB64 = (await fs.readFile(iconPath)).toString('base64')
      exported.iconExt = extname(profile.iconFile)
    }
  }
  if (profile.bgImage) {
    const bgPath = join(paths.backgroundsDir(), profile.bgImage)
    if (existsSync(bgPath)) {
      exported.bgImageB64 = (await fs.readFile(bgPath)).toString('base64')
      exported.bgImageExt = extname(profile.bgImage)
    }
  } else if (profile.bgColor) {
    exported.bgColor = profile.bgColor
  }

  await fs.mkdir(paths.profilesDir(), { recursive: true })
  const result = await dialog.showSaveDialog(win, {
    defaultPath: join(paths.profilesDir(), `${profile.name}.gtprofile`),
    filters: [{ name: 'Gamut Profile', extensions: ['gtprofile'] }]
  })
  if (result.canceled || !result.filePath) return null

  await fs.writeFile(result.filePath, JSON.stringify(exported), 'utf-8')
  return { path: result.filePath }
}

/** Always creates a new, uniquely-named profile — never overwrites/merges an existing one. */
export async function importProfile(win: BrowserWindow): Promise<Profile | null> {
  await fs.mkdir(paths.profilesDir(), { recursive: true })
  const result = await dialog.showOpenDialog(win, {
    defaultPath: paths.profilesDir(),
    filters: [
      { name: 'Gamut Profile', extensions: ['gtprofile'] },
      { name: 'All files', extensions: ['*'] }
    ],
    properties: ['openFile']
  })
  if (result.canceled || !result.filePaths[0]) return null

  const imported: GtProfileFile = JSON.parse(await fs.readFile(result.filePaths[0], 'utf-8'))
  const data = dataStore.get()

  let name = imported.name || 'Imported Game'
  const originalName = name
  let counter = 2
  while (name in data.profiles) {
    name = `${originalName} (${counter})`
    counter++
  }

  let iconFile: string | null = null
  if (imported.iconB64) {
    try {
      await fs.mkdir(paths.iconsDir(), { recursive: true })
      iconFile = `${randomUUID()}${safeImageExt(imported.iconExt)}`
      await saveCappedImageBuffer(
        Buffer.from(imported.iconB64, 'base64'),
        join(paths.iconsDir(), iconFile),
        ICON_MAX_DIMENSION
      )
    } catch {
      iconFile = null
    }
  }

  let bgImageFile: string | null = null
  if (imported.bgImageB64) {
    try {
      await fs.mkdir(paths.backgroundsDir(), { recursive: true })
      bgImageFile = `${randomUUID()}${safeImageExt(imported.bgImageExt)}`
      await saveCappedImageBuffer(
        Buffer.from(imported.bgImageB64, 'base64'),
        join(paths.backgroundsDir(), bgImageFile),
        BACKGROUND_MAX_DIMENSION
      )
    } catch {
      bgImageFile = null
    }
  }

  const profile: Profile = {
    name,
    seconds: imported.seconds ?? 0,
    iconFile,
    bgColor: bgImageFile ? null : (imported.bgColor ?? null),
    bgImage: bgImageFile,
    status: imported.status ?? 'in_progress',
    statusAt: imported.statusAt ?? null,
    statusSeconds: imported.statusSeconds ?? null,
    genres: imported.genres ?? [],
    lastPlayed: imported.lastPlayed ?? null,
    startedDate: imported.startedDate ?? null,
    notes: imported.notes ?? '',
    rating: (imported.rating ?? 0) as Profile['rating'],
    // Present only in files written by v3+. A v1/v2 export legitimately has
    // none, and starts with an empty log rather than inventing entries.
    // An export from a build that predates the aggregate has only entries, so
    // fold them; a newer one carries the totals for its whole history.
    sessionStats: imported.sessionStats ?? aggregateFrom(imported.sessionLog ?? []),
    sessionLog: trimSessionLog(imported.sessionLog ?? []),
    // Never carried across machines — the exe lives on the exporter's disk.
    exePath: null,
    steamAppId: imported.steamAppId ?? null,
    autoFetchArt: null,
    // Launch counts are machine-specific — they describe processes seen on
    // the exporting PC, not the game's history.
    launches: 0,
    openSeconds: 0,
    autoStartTimer: null,
    genresFromDetection: false,
    // Not carried in the file format: a star is a statement about your own
    // library, not a property of the game, so an imported profile starts
    // unstarred rather than inheriting whoever exported it.
    favorite: false,
    // Re-fetched from steamAppId (which IS carried) rather than embedded — it
    // would roughly double a .gtprofile's size for an image the receiving
    // install can download itself.
    coverFile: null
  }

  data.profiles[name] = profile
  await dataStore.safeSave()
  void writeStatusLog()
  return profile
}
