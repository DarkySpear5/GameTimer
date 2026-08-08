import { promises as fs, existsSync } from 'fs'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import { dataStore } from './dataStore'
import { paths } from './paths'
import { timerEngine } from '../timer/timerEngine'
import { writeStatusLog } from '../statusLog/writeStatusLog'
import { todayDateString } from '../util/date'
import { saveCappedImage } from '../util/imageResize'
import { enrichGame, storeArtFromUrl } from '../art/enrich'
import { emptyAggregate } from '@shared/sessionStats'
import { ICON_MAX_DIMENSION, BACKGROUND_MAX_DIMENSION } from '@shared/constants'
import type { Profile, Status } from '@shared/types'

function freshProfile(name: string): Profile {
  return {
    name,
    seconds: 0,
    iconFile: null,
    bgColor: null,
    bgImage: null,
    status: 'in_progress',
    statusAt: null,
    statusSeconds: null,
    genres: [],
    lastPlayed: null,
    startedDate: null,
    notes: '',
    rating: 0,
    sessionStats: emptyAggregate(),
    sessionLog: [],
    exePath: null,
    steamAppId: null,
    autoFetchArt: null,
    launches: 0,
    openSeconds: 0,
    autoStartTimer: null,
    genresFromDetection: false,
    favorite: false
  }
}

function requireProfile(name: string): Profile {
  const profile = dataStore.get().profiles[name]
  if (!profile) throw new Error(`No such profile: ${name}`)
  return profile
}

async function deleteFileIfExists(path: string | null, dir: string): Promise<void> {
  if (!path) return
  const full = join(dir, path)
  if (existsSync(full)) {
    try {
      await fs.unlink(full)
    } catch {
      // orphaned files are cosmetic, never fatal
    }
  }
}

export const profileService = {
  list(): Profile[] {
    return Object.values(dataStore.get().profiles)
  },

  async create(name: string): Promise<Profile> {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Name cannot be empty')
    const data = dataStore.get()
    if (trimmed in data.profiles) throw new Error(`"${trimmed}" already exists`)
    data.profiles[trimmed] = freshProfile(trimmed)
    await dataStore.safeSave()
    void writeStatusLog()
    return data.profiles[trimmed]
  },

  async rename(oldName: string, newName: string): Promise<Profile> {
    const trimmed = newName.trim()
    const data = dataStore.get()
    if (!trimmed || trimmed === oldName) return requireProfile(oldName)
    if (trimmed in data.profiles) throw new Error(`"${trimmed}" already exists`)
    const profile = requireProfile(oldName)
    delete data.profiles[oldName]
    profile.name = trimmed
    data.profiles[trimmed] = profile
    if (data.lastSelected === oldName) data.lastSelected = trimmed
    timerEngine.renameActive(oldName, trimmed)
    await dataStore.safeSave()
    void writeStatusLog()
    return profile
  },

  async delete(name: string): Promise<void> {
    const profile = requireProfile(name)
    timerEngine.stopActive(name)
    await deleteFileIfExists(profile.iconFile, paths.iconsDir())
    await deleteFileIfExists(profile.bgImage, paths.backgroundsDir())
    const data = dataStore.get()
    delete data.profiles[name]
    if (data.lastSelected === name) data.lastSelected = null
    await dataStore.safeSave()
    void writeStatusLog()
  },

  async duplicate(name: string): Promise<Profile> {
    // Checkpoint first so the copy reflects the live count while the original keeps running.
    timerEngine.checkpointOne(name)
    const original = requireProfile(name)
    const data = dataStore.get()

    let newName = `${name} (Copy)`
    let counter = 2
    while (newName in data.profiles) {
      newName = `${name} (Copy ${counter})`
      counter++
    }

    let newIconFile: string | null = null
    if (original.iconFile) {
      const oldPath = join(paths.iconsDir(), original.iconFile)
      if (existsSync(oldPath)) {
        newIconFile = `${randomUUID()}${extname(original.iconFile)}`
        try {
          await fs.mkdir(paths.iconsDir(), { recursive: true })
          await saveCappedImage(oldPath, join(paths.iconsDir(), newIconFile), ICON_MAX_DIMENSION)
        } catch {
          newIconFile = null
        }
      }
    }

    let newBgImage: string | null = null
    if (original.bgImage) {
      const oldPath = join(paths.backgroundsDir(), original.bgImage)
      if (existsSync(oldPath)) {
        newBgImage = `${randomUUID()}${extname(original.bgImage)}`
        try {
          await fs.mkdir(paths.backgroundsDir(), { recursive: true })
          await saveCappedImage(oldPath, join(paths.backgroundsDir(), newBgImage), BACKGROUND_MAX_DIMENSION)
        } catch {
          newBgImage = null
        }
      }
    }

    const copy: Profile = {
      name: newName,
      seconds: original.seconds,
      iconFile: newIconFile,
      bgColor: newBgImage ? null : original.bgColor,
      bgImage: newBgImage,
      status: original.status,
      statusAt: original.statusAt,
      statusSeconds: original.statusSeconds,
      genres: [...original.genres],
      lastPlayed: original.lastPlayed,
      startedDate: original.startedDate,
      notes: original.notes,
      rating: original.rating,
      // Copied, not reset: duplicate() clones seconds and the completion
      // snapshot too, so an empty log here would make the copy claim hours
      // of playtime across zero sessions. Spread so the two profiles never
      // share one array.
      sessionStats: { ...original.sessionStats },
      sessionLog: [...original.sessionLog],
      // The copy points at the same game, so it keeps the link and the art
      // preference — only the name differs.
      exePath: original.exePath,
      steamAppId: original.steamAppId,
      autoFetchArt: original.autoFetchArt,
      // Counters are the copy's own from zero: it has never been launched.
      launches: 0,
      openSeconds: 0,
      autoStartTimer: original.autoStartTimer,
      genresFromDetection: original.genresFromDetection,
      favorite: original.favorite
    }
    data.profiles[newName] = copy
    await dataStore.safeSave()
    void writeStatusLog()
    return copy
  },

  async setStatus(name: string, status: Status): Promise<Profile> {
    if (status !== 'in_progress' && timerEngine.isRunning(name)) {
      timerEngine.pause(name)
    }
    const profile = requireProfile(name)
    profile.status = status
    // Going back to In Progress deliberately leaves statusAt/statusSeconds
    // alone. They used to be nulled here, which meant one stray click on the
    // Complete button of an already-completed game permanently destroyed both
    // the date it was finished on and the playtime it was finished at — no
    // confirmation, no undo, and the numbers are unrecoverable because nothing
    // else records them. Nothing renders them while a game is In Progress (the
    // Data tab, the Modify dialog and the status log all gate on status), so
    // keeping them is invisible until the next real status change overwrites
    // them. That makes an accidental un-complete/re-complete round trip
    // lossless instead of destructive.
    if (status !== 'in_progress') {
      profile.statusAt = todayDateString()
      profile.statusSeconds = profile.seconds
    }
    await dataStore.safeSave()
    void writeStatusLog()
    return profile
  },

  /**
   * Links an executable to a game that already exists — the route for a
   * manually added game to become auto-detectable without being re-created and
   * losing its playtime, sessions and completion record.
   *
   * Art and genres are only filled in where they are missing, so linking never
   * overwrites choices already made.
   */
  async linkExecutable(name: string, exePath: string, steamAppId: number | null): Promise<Profile> {
    const profile = requireProfile(name)
    profile.exePath = exePath
    profile.steamAppId = steamAppId

    const wantsArt = profile.autoFetchArt ?? dataStore.get().settings.autoFetchArt
    if (wantsArt && (!profile.iconFile || !profile.bgImage || profile.genres.length === 0)) {
      const found = await enrichGame(profile.name, steamAppId)
      if (found.iconFile && !profile.iconFile) profile.iconFile = found.iconFile
      if (found.bgImage && !profile.bgImage) profile.bgImage = found.bgImage
      if (found.genres.length > 0 && profile.genres.length === 0) {
        profile.genres = found.genres
        profile.genresFromDetection = true
      }
    }

    await dataStore.safeSave()
    return profile
  },

  /** Detaches the executable. The game keeps everything else, including its art. */
  async unlinkExecutable(name: string): Promise<Profile> {
    const profile = requireProfile(name)
    profile.exePath = null
    profile.steamAppId = null
    await dataStore.safeSave()
    return profile
  },

  /**
   * Creates a game from the Add Game picker: links the executable, caches the
   * resolved appid, and pulls cover/background art if this game (or, when it
   * has no preference of its own, the global setting) allows it.
   *
   * Art is best-effort by design — a game with no Steam listing, or a machine
   * with no network, still gets created. It just has no art, exactly like a
   * manually added one.
   */
  async createDetected(
    name: string,
    exePath: string | null,
    steamAppId: number | null
  ): Promise<Profile> {
    const profile = await this.create(name)
    profile.exePath = exePath
    profile.steamAppId = steamAppId

    // Runs even without an appid: enrichGame falls back to GOG, which is how
    // a non-Steam game still gets art and genres.
    if (dataStore.get().settings.autoFetchArt) {
      const found = await enrichGame(name, steamAppId)
      if (found.iconFile) profile.iconFile = found.iconFile
      if (found.bgImage) profile.bgImage = found.bgImage
      // Only ever fills an empty list — never overwrites tags the user chose.
      if (found.genres.length > 0 && profile.genres.length === 0) {
        profile.genres = found.genres
        profile.genresFromDetection = true
      }
    }

    await dataStore.safeSave()
    return profile
  },

  /** Re-pulls art and genres from Steam, then GOG — the Modify dialog's manual refresh. Works with or without an appid. */
  async refreshArt(name: string): Promise<Profile> {
    const profile = requireProfile(name)
    const found = await enrichGame(profile.name, profile.steamAppId)
    if (found.iconFile) {
      await deleteFileIfExists(profile.iconFile, paths.iconsDir())
      profile.iconFile = found.iconFile
    }
    if (found.bgImage) {
      await deleteFileIfExists(profile.bgImage, paths.backgroundsDir())
      profile.bgImage = found.bgImage
      profile.bgColor = null
    }
    if (found.genres.length > 0 && profile.genres.length === 0) {
      profile.genres = found.genres
      profile.genresFromDetection = true
    }
    await dataStore.safeSave()
    return profile
  },

  /**
   * Applies a specific image the user picked from the art picker. Goes through
   * the same download-validate-cap path as an automatic fetch, so a chosen
   * image is stored identically to a fetched or manually browsed one.
   */
  async setArtFromUrl(name: string, kind: 'icon' | 'background', url: string): Promise<Profile> {
    const profile = requireProfile(name)
    const saved = await storeArtFromUrl(url, kind)
    if (!saved) return profile
    if (kind === 'icon') {
      await deleteFileIfExists(profile.iconFile, paths.iconsDir())
      profile.iconFile = saved
    } else {
      await deleteFileIfExists(profile.bgImage, paths.backgroundsDir())
      profile.bgImage = saved
      profile.bgColor = null
    }
    await dataStore.safeSave()
    return profile
  },

  /** null = follow the global setting; true/false override it for this game. */
  async setAutoStartTimer(name: string, value: boolean | null): Promise<Profile> {
    const profile = requireProfile(name)
    profile.autoStartTimer = value
    await dataStore.safeSave()
    return profile
  },

  /** null = follow the global setting; true/false override it for this game. */
  async setAutoFetchArt(name: string, value: boolean | null): Promise<Profile> {
    const profile = requireProfile(name)
    profile.autoFetchArt = value
    await dataStore.safeSave()
    return profile
  },

  /**
   * The ONLY thing that destroys a completion snapshot. Everything else —
   * un-completing, reviving a dropped game, playing more — deliberately
   * preserves it (see the comment in setStatus). The caller is responsible
   * for confirming first; this is the irreversible half.
   */
  async clearStatusRecord(name: string): Promise<Profile> {
    const profile = requireProfile(name)
    profile.statusAt = null
    profile.statusSeconds = null
    await dataStore.safeSave()
    void writeStatusLog()
    return profile
  },

  async setGenres(name: string, genres: string[]): Promise<Profile> {
    const profile = requireProfile(name)
    // Editing at all means the set is the user's now, not the fetcher's.
    profile.genresFromDetection = false
    profile.genres = genres
    await dataStore.safeSave()
    return profile
  },

  async setRating(name: string, rating: 0 | 1 | 2 | 3 | 4 | 5): Promise<Profile> {
    const profile = requireProfile(name)
    profile.rating = rating
    await dataStore.safeSave()
    return profile
  },

  async setFavorite(name: string, favorite: boolean): Promise<Profile> {
    const profile = requireProfile(name)
    profile.favorite = favorite
    await dataStore.safeSave()
    return profile
  },

  async setNotes(name: string, notes: string): Promise<Profile> {
    const profile = requireProfile(name)
    profile.notes = notes
    await dataStore.safeSave()
    return profile
  },

  async addRemoveTime(name: string, deltaSeconds: number, note?: string): Promise<Profile> {
    const profile = requireProfile(name)
    const removing = deltaSeconds < 0
    const magnitude = Math.abs(deltaSeconds)
    if (removing) {
      profile.seconds = Math.max(0, profile.seconds - magnitude)
    } else {
      profile.seconds += magnitude
      profile.lastPlayed = Date.now()
    }
    const trimmedNote = note?.trim()
    if (trimmedNote) {
      const hours = Math.floor(magnitude / 3600)
      const minutes = Math.floor((magnitude % 3600) / 60)
      const hm = hours ? `${hours}h ${minutes}m` : `${minutes}m`
      const sign = removing ? '-' : '+'
      const line = `[${todayDateString()}] ${sign}${hm} — ${trimmedNote}`
      profile.notes = profile.notes ? `${profile.notes}\n${line}` : line
    }
    await dataStore.safeSave()
    void writeStatusLog()
    return profile
  },

  async resetTime(name: string): Promise<Profile> {
    const profile = requireProfile(name)
    profile.seconds = 0
    timerEngine.restartActiveIfRunning(name)
    await dataStore.safeSave()
    return profile
  },

  async setIconFile(name: string, sourcePath: string): Promise<Profile> {
    const profile = requireProfile(name)
    await fs.mkdir(paths.iconsDir(), { recursive: true })
    const fname = `${randomUUID()}${extname(sourcePath).toLowerCase() || '.png'}`
    await saveCappedImage(sourcePath, join(paths.iconsDir(), fname), ICON_MAX_DIMENSION)
    await deleteFileIfExists(profile.iconFile, paths.iconsDir())
    profile.iconFile = fname
    await dataStore.safeSave()
    return profile
  },

  async setBackgroundImage(name: string, sourcePath: string): Promise<Profile> {
    const profile = requireProfile(name)
    await fs.mkdir(paths.backgroundsDir(), { recursive: true })
    const fname = `${randomUUID()}${extname(sourcePath).toLowerCase() || '.png'}`
    await saveCappedImage(sourcePath, join(paths.backgroundsDir(), fname), BACKGROUND_MAX_DIMENSION)
    await deleteFileIfExists(profile.bgImage, paths.backgroundsDir())
    profile.bgImage = fname
    profile.bgColor = null
    await dataStore.safeSave()
    return profile
  },

  async setBackgroundColor(name: string, color: string): Promise<Profile> {
    const profile = requireProfile(name)
    await deleteFileIfExists(profile.bgImage, paths.backgroundsDir())
    profile.bgImage = null
    profile.bgColor = color
    await dataStore.safeSave()
    return profile
  },

  async clearBackground(name: string): Promise<Profile> {
    const profile = requireProfile(name)
    await deleteFileIfExists(profile.bgImage, paths.backgroundsDir())
    profile.bgImage = null
    profile.bgColor = null
    await dataStore.safeSave()
    return profile
  },

  async select(name: string | null): Promise<void> {
    dataStore.get().lastSelected = name
    await dataStore.safeSave()
  }
}
